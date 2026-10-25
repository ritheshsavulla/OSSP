#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif
#include "memory_manager.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <dirent.h>
#include <pthread.h>
#include <ctype.h>
#include <stdint.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/mman.h>

static MappedFileEntry g_mapped_table[MAX_ACTIVE_MAPS];
static pthread_mutex_t g_mm_mutex = PTHREAD_MUTEX_INITIALIZER;
static long g_page_size = 4096;

/* Helper to safely escape strings for JSON */
static void escape_json_string(const char *src, char *dst, size_t max_dst) {
    if (!src || !dst || max_dst == 0) return;
    size_t di = 0;
    for (size_t si = 0; src[si] != '\0' && di + 4 < max_dst; ++si) {
        unsigned char c = (unsigned char)src[si];
        if (c == '"') {
            dst[di++] = '\\'; dst[di++] = '"';
        } else if (c == '\\') {
            dst[di++] = '\\'; dst[di++] = '\\';
        } else if (c == '\b') {
            dst[di++] = '\\'; dst[di++] = 'b';
        } else if (c == '\f') {
            dst[di++] = '\\'; dst[di++] = 'f';
        } else if (c == '\n') {
            dst[di++] = '\\'; dst[di++] = 'n';
        } else if (c == '\r') {
            dst[di++] = '\\'; dst[di++] = 'r';
        } else if (c == '\t') {
            dst[di++] = '\\'; dst[di++] = 't';
        } else if (c < 32 || c == 127) {
            di += snprintf(dst + di, max_dst - di, "\\u%04x", c);
        } else {
            dst[di++] = c;
        }
    }
    dst[di] = '\0';
}

/* Helper to convert raw bytes to hex string */
static void bytes_to_hex(const unsigned char *src, size_t len, char *dst, size_t max_dst) {
    if (!src || !dst || max_dst == 0) return;
    size_t di = 0;
    for (size_t i = 0; i < len && di + 3 < max_dst; ++i) {
        di += snprintf(dst + di, max_dst - di, "%02x ", src[i]);
    }
    if (di > 0 && dst[di - 1] == ' ') {
        dst[di - 1] = '\0';
    } else {
        dst[di] = '\0';
    }
}

/* Helper to format POSIX file permissions (e.g. -rw-r--r--) */
static void format_permissions(mode_t mode, char *str) {
    str[0] = S_ISDIR(mode) ? 'd' : '-';
    str[1] = (mode & S_IRUSR) ? 'r' : '-';
    str[2] = (mode & S_IWUSR) ? 'w' : '-';
    str[3] = (mode & S_IXUSR) ? 'x' : '-';
    str[4] = (mode & S_IRGRP) ? 'r' : '-';
    str[5] = (mode & S_IWGRP) ? 'w' : '-';
    str[6] = (mode & S_IXGRP) ? 'x' : '-';
    str[7] = (mode & S_IROTH) ? 'r' : '-';
    str[8] = (mode & S_IWOTH) ? 'w' : '-';
    str[9] = (mode & S_IXOTH) ? 'x' : '-';
    str[10] = '\0';
}

void mm_init(void) {
    pthread_mutex_lock(&g_mm_mutex);
    memset(g_mapped_table, 0, sizeof(g_mapped_table));
    g_page_size = sysconf(_SC_PAGESIZE);
    if (g_page_size <= 0) {
        g_page_size = 4096;
    }
    struct stat st;
    if (stat(DATA_DIR, &st) != 0) {
        mkdir(DATA_DIR, 0755);
    }
    pthread_mutex_unlock(&g_mm_mutex);
}

void mm_cleanup(void) {
    pthread_mutex_lock(&g_mm_mutex);
    for (int i = 0; i < MAX_ACTIVE_MAPS; ++i) {
        if (g_mapped_table[i].is_mapped && g_mapped_table[i].mapped_addr != NULL) {
            /* Sync dirty changes and release virtual memory mapping */
            msync(g_mapped_table[i].mapped_addr, g_mapped_table[i].mapped_size, MS_SYNC);
            munmap(g_mapped_table[i].mapped_addr, g_mapped_table[i].mapped_size);
            if (g_mapped_table[i].fd >= 0) {
                close(g_mapped_table[i].fd);
            }
            g_mapped_table[i].is_mapped = 0;
            g_mapped_table[i].mapped_addr = NULL;
        }
    }
    pthread_mutex_unlock(&g_mm_mutex);
}

/* Strict security validation against path traversal */
int mm_validate_filename(const char *filename) {
    if (!filename || strlen(filename) == 0) return 0;
    if (strlen(filename) >= MAX_FILENAME_LEN - 1) return 0;
    
    /* Prevent directory traversal patterns */
    if (strstr(filename, "..") != NULL) return 0;
    if (strchr(filename, '/') != NULL) return 0;
    if (strchr(filename, '\\') != NULL) return 0;
    if (filename[0] == '.') return 0; /* No hidden files */

    /* Only allow alphanumeric, dash, underscore, dot */
    for (size_t i = 0; filename[i] != '\0'; ++i) {
        char c = filename[i];
        if (!isalnum((unsigned char)c) && c != '.' && c != '_' && c != '-') {
            return 0;
        }
    }
    return 1;
}

int mm_get_safe_path(const char *filename, char *out_path, size_t max_len) {
    if (!mm_validate_filename(filename)) return 0;
    int written = snprintf(out_path, max_len, "%s/%s", DATA_DIR, filename);
    return (written > 0 && (size_t)written < max_len);
}

MappedFileEntry *mm_find_entry(const char *filename) {
    for (int i = 0; i < MAX_ACTIVE_MAPS; ++i) {
        if (g_mapped_table[i].is_mapped && strcmp(g_mapped_table[i].filename, filename) == 0) {
            return &g_mapped_table[i];
        }
    }
    return NULL;
}

/* GET /api/files - List all files in data/ and their mapping status */
int mm_list_files(char *json_out, size_t max_len) {
    pthread_mutex_lock(&g_mm_mutex);
    DIR *dir = opendir(DATA_DIR);
    if (!dir) {
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"Failed to open data directory: %s\"}", strerror(errno));
        pthread_mutex_unlock(&g_mm_mutex);
        return -1;
    }

    size_t offset = snprintf(json_out, max_len, "{\"success\":true,\"files\":[");
    struct dirent *entry;
    int first = 1;

    while ((entry = readdir(dir)) != NULL) {
        if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) {
            continue;
        }
        if (entry->d_name[0] == '.') {
            continue;
        }

        char fullpath[MAX_PATH_LEN];
        snprintf(fullpath, sizeof(fullpath), "%s/%s", DATA_DIR, entry->d_name);

        struct stat st;
        /* Using fstat() or stat() to retrieve file metadata */
        if (stat(fullpath, &st) != 0) {
            continue;
        }

        /* Check if active mapping exists */
        MappedFileEntry *map_entry = mm_find_entry(entry->d_name);
        char perm_str[16];
        format_permissions(st.st_mode, perm_str);

        char esc_name[MAX_FILENAME_LEN * 2];
        escape_json_string(entry->d_name, esc_name, sizeof(esc_name));

        char item_buf[1024];
        if (map_entry) {
            snprintf(item_buf, sizeof(item_buf),
                "%s{\"filename\":\"%s\",\"size\":%lld,\"inode\":%llu,\"permissions\":\"%s\",\"octal_mode\":\"%04o\","
                "\"modified\":%ld,\"is_mapped\":true,\"mapped_address\":\"0x%lx\",\"mapped_size\":%zu,"
                "\"fd\":%d,\"is_dirty\":%s,\"write_count\":%zu}",
                first ? "" : ",",
                esc_name,
                (long long)st.st_size,
                (unsigned long long)st.st_ino,
                perm_str,
                st.st_mode & 0777,
                (long)st.st_mtime,
                (uintptr_t)map_entry->mapped_addr,
                map_entry->mapped_size,
                map_entry->fd,
                map_entry->is_dirty ? "true" : "false",
                map_entry->write_count
            );
        } else {
            snprintf(item_buf, sizeof(item_buf),
                "%s{\"filename\":\"%s\",\"size\":%lld,\"inode\":%llu,\"permissions\":\"%s\",\"octal_mode\":\"%04o\","
                "\"modified\":%ld,\"is_mapped\":false,\"mapped_address\":null,\"mapped_size\":0,"
                "\"fd\":-1,\"is_dirty\":false,\"write_count\":0}",
                first ? "" : ",",
                esc_name,
                (long long)st.st_size,
                (unsigned long long)st.st_ino,
                perm_str,
                st.st_mode & 0777,
                (long)st.st_mtime
            );
        }
        first = 0;

        size_t item_len = strlen(item_buf);
        if (offset + item_len + 4 < max_len) {
            strcpy(json_out + offset, item_buf);
            offset += item_len;
        }
    }

    closedir(dir);
    snprintf(json_out + offset, max_len - offset, "]}");
    pthread_mutex_unlock(&g_mm_mutex);
    return 0;
}

/* POST /api/create - Create file using open(), ftruncate(), write(), close() */
int mm_create_file(const char *filename, size_t initial_size, const char *initial_content, char *json_out, size_t max_len) {
    if (!mm_validate_filename(filename)) {
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"Invalid filename or path traversal detected\"}");
        return -1;
    }

    char path[MAX_PATH_LEN];
    mm_get_safe_path(filename, path, sizeof(path));

    pthread_mutex_lock(&g_mm_mutex);

    /* Check if file already exists */
    struct stat st;
    if (stat(path, &st) == 0) {
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"File '%s' already exists\"}", filename);
        pthread_mutex_unlock(&g_mm_mutex);
        return -1;
    }

    /* System Call 1: open() with O_CREAT | O_RDWR | O_EXCL */
    int fd = open(path, O_CREAT | O_RDWR | O_EXCL, 0644);
    if (fd < 0) {
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"open() syscall failed: %s\"}", strerror(errno));
        pthread_mutex_unlock(&g_mm_mutex);
        return -1;
    }

    size_t written_bytes = 0;
    if (initial_content && strlen(initial_content) > 0) {
        size_t clen = strlen(initial_content);
        /* System Call 2: write() */
        ssize_t w = write(fd, initial_content, clen);
        if (w > 0) written_bytes = (size_t)w;
    }

    /* System Call 3: ftruncate() if requested size is larger */
    if (initial_size > written_bytes) {
        if (ftruncate(fd, initial_size) != 0) {
            /* ftruncate error */
        }
    }

    /* System Call 4: fstat() to get updated metadata */
    fstat(fd, &st);

    /* System Call 5: close() */
    close(fd);

    snprintf(json_out, max_len,
        "{\"success\":true,\"message\":\"File created successfully\",\"filename\":\"%s\","
        "\"size\":%lld,\"inode\":%llu,\"syscalls\":[\"open\",\"write\",\"ftruncate\",\"fstat\",\"close\"]}",
        filename, (long long)st.st_size, (unsigned long long)st.st_ino);

    pthread_mutex_unlock(&g_mm_mutex);
    return 0;
}

/* POST /api/map - Open file and map into virtual memory using mmap() */
int mm_map_file(const char *filename, const char *prot_str, const char *flags_str, char *json_out, size_t max_len) {
    if (!mm_validate_filename(filename)) {
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"Invalid filename\"}");
        return -1;
    }

    char path[MAX_PATH_LEN];
    mm_get_safe_path(filename, path, sizeof(path));

    pthread_mutex_lock(&g_mm_mutex);

    /* Check if already mapped */
    MappedFileEntry *entry = mm_find_entry(filename);
    if (entry != NULL && entry->is_mapped) {
        snprintf(json_out, max_len,
            "{\"success\":true,\"message\":\"File is already mapped\",\"filename\":\"%s\","
            "\"mapped_address\":\"0x%lx\",\"mapped_size\":%zu,\"fd\":%d,\"already_mapped\":true}",
            filename, (uintptr_t)entry->mapped_addr, entry->mapped_size, entry->fd);
        pthread_mutex_unlock(&g_mm_mutex);
        return 0;
    }

    /* System Call: open() */
    int fd = open(path, O_RDWR);
    if (fd < 0) {
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"open() failed: %s\"}", strerror(errno));
        pthread_mutex_unlock(&g_mm_mutex);
        return -1;
    }

    /* System Call: fstat() */
    struct stat st;
    if (fstat(fd, &st) != 0) {
        close(fd);
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"fstat() failed: %s\"}", strerror(errno));
        pthread_mutex_unlock(&g_mm_mutex);
        return -1;
    }

    /* Note on Linux mmap(): mapping a 0-byte file returns EINVAL!
       If file size is 0, we automatically expand it to a minimum non-zero size (e.g. 64 bytes) using ftruncate() */
    size_t map_size = (size_t)st.st_size;
    int auto_resized = 0;
    if (map_size == 0) {
        map_size = 64;
        if (ftruncate(fd, map_size) != 0) {
            close(fd);
            snprintf(json_out, max_len, "{\"success\":false,\"error\":\"ftruncate() failed to expand empty file: %s\"}", strerror(errno));
            pthread_mutex_unlock(&g_mm_mutex);
            return -1;
        }
        st.st_size = map_size;
        auto_resized = 1;
    }

    /* Protection flags */
    int prot = PROT_READ | PROT_WRITE;
    if (prot_str && strcmp(prot_str, "ro") == 0) {
        prot = PROT_READ;
    }

    /* Mapping flags */
    int flags = MAP_SHARED;
    if (flags_str && strcmp(flags_str, "private") == 0) {
        flags = MAP_PRIVATE;
    }

    /* System Call: mmap() */
    void *addr = mmap(NULL, map_size, prot, flags, fd, 0);
    if (addr == MAP_FAILED) {
        int err = errno;
        close(fd);
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"mmap() syscall failed: %s (errno %d)\"}", strerror(err), err);
        pthread_mutex_unlock(&g_mm_mutex);
        return -1;
    }

    /* Find empty slot in mapping table */
    int slot = -1;
    for (int i = 0; i < MAX_ACTIVE_MAPS; ++i) {
        if (!g_mapped_table[i].is_mapped) {
            slot = i;
            break;
        }
    }

    if (slot == -1) {
        /* Release mapping if table full */
        munmap(addr, map_size);
        close(fd);
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"Mapping table full (max %d active mappings)\"}", MAX_ACTIVE_MAPS);
        pthread_mutex_unlock(&g_mm_mutex);
        return -1;
    }

    snprintf(g_mapped_table[slot].filename, sizeof(g_mapped_table[slot].filename), "%s", filename);
    snprintf(g_mapped_table[slot].filepath, sizeof(g_mapped_table[slot].filepath), "%s", path);
    g_mapped_table[slot].fd = fd;
    g_mapped_table[slot].mapped_addr = addr;
    g_mapped_table[slot].mapped_size = map_size;
    g_mapped_table[slot].prot = prot;
    g_mapped_table[slot].flags = flags;
    g_mapped_table[slot].is_mapped = 1;
    g_mapped_table[slot].is_dirty = 0;
    g_mapped_table[slot].map_time = time(NULL);
    g_mapped_table[slot].last_sync_time = 0;
    g_mapped_table[slot].write_count = 0;

    /* Calculate page count */
    size_t page_count = (map_size + g_page_size - 1) / g_page_size;

    snprintf(json_out, max_len,
        "{\"success\":true,\"message\":\"File mapped to virtual memory successfully\","
        "\"filename\":\"%s\",\"mapped_address\":\"0x%lx\",\"virtual_end_address\":\"0x%lx\","
        "\"mapped_size\":%zu,\"fd\":%d,\"prot\":\"%s\",\"flags\":\"%s\","
        "\"pages\":%zu,\"page_size\":%ld,\"auto_resized\":%s,"
        "\"syscalls\":[\"open\",\"fstat\",\"mmap\"%s]}",
        filename,
        (uintptr_t)addr,
        (uintptr_t)addr + map_size,
        map_size,
        fd,
        (prot & PROT_WRITE) ? "PROT_READ | PROT_WRITE" : "PROT_READ",
        (flags & MAP_SHARED) ? "MAP_SHARED" : "MAP_PRIVATE",
        page_count,
        g_page_size,
        auto_resized ? "true" : "false",
        auto_resized ? ",\"ftruncate\"" : ""
    );

    pthread_mutex_unlock(&g_mm_mutex);
    return 0;
}

/* POST /api/read - Read file via mapped pointer OR traditional read() */
int mm_read_file(const char *filename, size_t offset, size_t length, char *json_out, size_t max_len) {
    if (!mm_validate_filename(filename)) {
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"Invalid filename\"}");
        return -1;
    }

    char path[MAX_PATH_LEN];
    mm_get_safe_path(filename, path, sizeof(path));

    pthread_mutex_lock(&g_mm_mutex);
    MappedFileEntry *entry = mm_find_entry(filename);

    if (entry != NULL && entry->is_mapped) {
        /* Reading directly from MAPPED MEMORY POINTER */
        if (offset >= entry->mapped_size) {
            snprintf(json_out, max_len, "{\"success\":false,\"error\":\"Offset exceeds mapped file size (%zu)\"}", entry->mapped_size);
            pthread_mutex_unlock(&g_mm_mutex);
            return -1;
        }

        size_t available = entry->mapped_size - offset;
        size_t to_read = (length > 0 && length < available) ? length : available;

        /* Pointer dereference: real virtual memory read */
        const char *src_ptr = (const char *)entry->mapped_addr + offset;

        /* Allocate scratch buffers */
        char *content_buf = malloc(to_read + 1);
        char *escaped_buf = malloc((to_read * 4) + 16);
        char *hex_buf = malloc((to_read * 3) + 16);

        if (!content_buf || !escaped_buf || !hex_buf) {
            free(content_buf); free(escaped_buf); free(hex_buf);
            snprintf(json_out, max_len, "{\"success\":false,\"error\":\"Memory allocation failed\"}");
            pthread_mutex_unlock(&g_mm_mutex);
            return -1;
        }

        memcpy(content_buf, src_ptr, to_read);
        content_buf[to_read] = '\0';

        escape_json_string(content_buf, escaped_buf, (to_read * 4) + 16);
        bytes_to_hex((const unsigned char *)content_buf, to_read, hex_buf, (to_read * 3) + 16);

        snprintf(json_out, max_len,
            "{\"success\":true,\"method\":\"mmap_direct_pointer_access\","
            "\"message\":\"Read directly from process virtual address space\","
            "\"filename\":\"%s\",\"mapped_address\":\"0x%lx\",\"read_pointer\":\"0x%lx\","
            "\"offset\":%zu,\"bytes_read\":%zu,\"total_size\":%zu,"
            "\"content\":\"%s\",\"hex_dump\":\"%s\",\"syscall_overhead\":\"0 (Direct CPU Memory Access)\"}",
            filename,
            (uintptr_t)entry->mapped_addr,
            (uintptr_t)src_ptr,
            offset,
            to_read,
            entry->mapped_size,
            escaped_buf,
            hex_buf
        );

        free(content_buf);
        free(escaped_buf);
        free(hex_buf);
        pthread_mutex_unlock(&g_mm_mutex);
        return 0;
    }

    /* If not mapped, read via standard Linux POSIX syscalls: open(), lseek(), read(), close() */
    int fd = open(path, O_RDONLY);
    if (fd < 0) {
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"open() failed: %s\"}", strerror(errno));
        pthread_mutex_unlock(&g_mm_mutex);
        return -1;
    }

    struct stat st;
    fstat(fd, &st);

    if (offset >= (size_t)st.st_size && st.st_size > 0) {
        close(fd);
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"Offset exceeds file size\"}");
        pthread_mutex_unlock(&g_mm_mutex);
        return -1;
    }

    /* System call: lseek() */
    if (offset > 0) {
        lseek(fd, offset, SEEK_SET);
    }

    size_t to_read = length > 0 ? length : (size_t)st.st_size - offset;
    char *buf = malloc(to_read + 1);
    if (!buf) {
        close(fd);
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"Out of memory\"}");
        pthread_mutex_unlock(&g_mm_mutex);
        return -1;
    }

    /* System call: read() */
    ssize_t bytes_read = read(fd, buf, to_read);
    if (bytes_read < 0) bytes_read = 0;
    buf[bytes_read] = '\0';

    /* System call: close() */
    close(fd);

    char *escaped_buf = malloc((bytes_read * 4) + 16);
    char *hex_buf = malloc((bytes_read * 3) + 16);
    escape_json_string(buf, escaped_buf, (bytes_read * 4) + 16);
    bytes_to_hex((const unsigned char *)buf, bytes_read, hex_buf, (bytes_read * 3) + 16);

    snprintf(json_out, max_len,
        "{\"success\":true,\"method\":\"posix_read_syscall\","
        "\"message\":\"Read using traditional read() system call (File is not currently mapped)\","
        "\"filename\":\"%s\",\"mapped_address\":null,\"offset\":%zu,\"bytes_read\":%zd,\"total_size\":%lld,"
        "\"content\":\"%s\",\"hex_dump\":\"%s\",\"syscalls\":[\"open\",\"fstat\",\"lseek\",\"read\",\"close\"]}",
        filename,
        offset,
        bytes_read,
        (long long)st.st_size,
        escaped_buf,
        hex_buf
    );

    free(buf);
    free(escaped_buf);
    free(hex_buf);
    pthread_mutex_unlock(&g_mm_mutex);
    return 0;
}

/* POST /api/write - Write data through mapped memory pointer OR standard write() */
int mm_write_file(const char *filename, size_t offset, const char *content, size_t content_len, char *json_out, size_t max_len) {
    if (!mm_validate_filename(filename)) {
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"Invalid filename\"}");
        return -1;
    }
    if (!content) {
        content = "";
        content_len = 0;
    }

    char path[MAX_PATH_LEN];
    mm_get_safe_path(filename, path, sizeof(path));

    pthread_mutex_lock(&g_mm_mutex);
    MappedFileEntry *entry = mm_find_entry(filename);

    if (entry != NULL && entry->is_mapped) {
        /* Check if write exceeds mapped buffer size */
        size_t required_size = offset + content_len;
        int resized = 0;

        if (required_size > entry->mapped_size) {
            /* We must resize the underlying file using ftruncate() and re-map using munmap() + mmap()
               because accessing beyond mapped_size causes SIGBUS! */
            munmap(entry->mapped_addr, entry->mapped_size);

            /* System call: ftruncate() to extend file */
            if (ftruncate(entry->fd, required_size) != 0) {
                /* Try to restore previous mapping */
                entry->mapped_addr = mmap(NULL, entry->mapped_size, entry->prot, entry->flags, entry->fd, 0);
                snprintf(json_out, max_len, "{\"success\":false,\"error\":\"ftruncate() failed to extend file: %s\"}", strerror(errno));
                pthread_mutex_unlock(&g_mm_mutex);
                return -1;
            }

            /* System call: mmap() with new size */
            void *new_addr = mmap(NULL, required_size, entry->prot, entry->flags, entry->fd, 0);
            if (new_addr == MAP_FAILED) {
                snprintf(json_out, max_len, "{\"success\":false,\"error\":\"Remapping failed after resize: %s\"}", strerror(errno));
                entry->is_mapped = 0;
                entry->mapped_addr = NULL;
                pthread_mutex_unlock(&g_mm_mutex);
                return -1;
            }

            entry->mapped_addr = new_addr;
            entry->mapped_size = required_size;
            resized = 1;
        }

        /* DIRECT MEMORY WRITE: memcpy into mapped memory pointer without any write() syscall! */
        char *target_ptr = (char *)entry->mapped_addr + offset;
        memcpy(target_ptr, content, content_len);

        entry->is_dirty = 1;
        entry->write_count++;

        snprintf(json_out, max_len,
            "{\"success\":true,\"method\":\"mmap_virtual_memory_write\","
            "\"message\":\"Data written directly into virtual memory pages (Page Cache dirty bit set)\","
            "\"filename\":\"%s\",\"mapped_address\":\"0x%lx\",\"write_pointer\":\"0x%lx\","
            "\"offset\":%zu,\"bytes_written\":%zu,\"mapped_size\":%zu,\"is_dirty\":true,"
            "\"auto_resized\":%s,\"requires_sync\":true,"
            "\"syscall_overhead\":\"0 (Direct pointer dereference, NO write() system call used)\"}",
            filename,
            (uintptr_t)entry->mapped_addr,
            (uintptr_t)target_ptr,
            offset,
            content_len,
            entry->mapped_size,
            resized ? "true" : "false"
        );

        pthread_mutex_unlock(&g_mm_mutex);
        return 0;
    }

    /* If not mapped, write using standard POSIX syscalls */
    int fd = open(path, O_RDWR);
    if (fd < 0) {
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"open() failed: %s\"}", strerror(errno));
        pthread_mutex_unlock(&g_mm_mutex);
        return -1;
    }

    if (offset > 0) {
        lseek(fd, offset, SEEK_SET);
    }

    ssize_t written = write(fd, content, content_len);
    close(fd);

    if (written < 0) {
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"write() syscall failed: %s\"}", strerror(errno));
        pthread_mutex_unlock(&g_mm_mutex);
        return -1;
    }

    snprintf(json_out, max_len,
        "{\"success\":true,\"method\":\"posix_write_syscall\","
        "\"message\":\"Data written using traditional write() syscall (File is not currently mapped)\","
        "\"filename\":\"%s\",\"offset\":%zu,\"bytes_written\":%zd,\"is_dirty\":false,"
        "\"syscalls\":[\"open\",\"lseek\",\"write\",\"close\"]}",
        filename, offset, written);

    pthread_mutex_unlock(&g_mm_mutex);
    return 0;
}

/* POST /api/resize - Resize file using ftruncate() and update mmap() */
int mm_resize_file(const char *filename, size_t new_size, char *json_out, size_t max_len) {
    if (!mm_validate_filename(filename)) {
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"Invalid filename\"}");
        return -1;
    }

    char path[MAX_PATH_LEN];
    mm_get_safe_path(filename, path, sizeof(path));

    pthread_mutex_lock(&g_mm_mutex);
    MappedFileEntry *entry = mm_find_entry(filename);

    if (entry != NULL && entry->is_mapped) {
        size_t old_size = entry->mapped_size;
        void *old_addr = entry->mapped_addr;

        /* Must munmap before ftruncate or remap */
        if (entry->is_dirty) {
            msync(entry->mapped_addr, entry->mapped_size, MS_SYNC);
        }
        munmap(entry->mapped_addr, entry->mapped_size);

        /* System Call: ftruncate() */
        if (ftruncate(entry->fd, new_size) != 0) {
            snprintf(json_out, max_len, "{\"success\":false,\"error\":\"ftruncate() failed: %s\"}", strerror(errno));
            /* Re-map at original size if possible */
            entry->mapped_addr = mmap(NULL, old_size, entry->prot, entry->flags, entry->fd, 0);
            pthread_mutex_unlock(&g_mm_mutex);
            return -1;
        }

        /* Remap at new size */
        void *new_addr = mmap(NULL, new_size, entry->prot, entry->flags, entry->fd, 0);
        if (new_addr == MAP_FAILED) {
            entry->is_mapped = 0;
            entry->mapped_addr = NULL;
            snprintf(json_out, max_len, "{\"success\":false,\"error\":\"mmap() failed after resize: %s\"}", strerror(errno));
            pthread_mutex_unlock(&g_mm_mutex);
            return -1;
        }

        entry->mapped_addr = new_addr;
        entry->mapped_size = new_size;
        entry->is_dirty = 0;

        snprintf(json_out, max_len,
            "{\"success\":true,\"message\":\"File resized with ftruncate() and remapped with mmap()\","
            "\"filename\":\"%s\",\"old_size\":%zu,\"new_size\":%zu,"
            "\"old_address\":\"0x%lx\",\"new_address\":\"0x%lx\","
            "\"syscalls\":[\"msync\",\"munmap\",\"ftruncate\",\"mmap\"]}",
            filename, old_size, new_size, (uintptr_t)old_addr, (uintptr_t)new_addr);

        pthread_mutex_unlock(&g_mm_mutex);
        return 0;
    }

    /* Not mapped: simply open, ftruncate, close */
    int fd = open(path, O_RDWR);
    if (fd < 0) {
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"open() failed: %s\"}", strerror(errno));
        pthread_mutex_unlock(&g_mm_mutex);
        return -1;
    }

    struct stat st;
    fstat(fd, &st);
    size_t old_size = (size_t)st.st_size;

    /* System Call: ftruncate() */
    if (ftruncate(fd, new_size) != 0) {
        close(fd);
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"ftruncate() failed: %s\"}", strerror(errno));
        pthread_mutex_unlock(&g_mm_mutex);
        return -1;
    }

    close(fd);

    snprintf(json_out, max_len,
        "{\"success\":true,\"message\":\"File resized successfully with ftruncate()\","
        "\"filename\":\"%s\",\"old_size\":%zu,\"new_size\":%zu,\"syscalls\":[\"open\",\"ftruncate\",\"close\"]}",
        filename, old_size, new_size);

    pthread_mutex_unlock(&g_mm_mutex);
    return 0;
}

/* POST /api/sync - Synchronize memory-mapped pages with disk via msync() */
int mm_sync_file(const char *filename, int is_async, char *json_out, size_t max_len) {
    if (!mm_validate_filename(filename)) {
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"Invalid filename\"}");
        return -1;
    }

    pthread_mutex_lock(&g_mm_mutex);
    MappedFileEntry *entry = mm_find_entry(filename);

    if (entry == NULL || !entry->is_mapped) {
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"File '%s' is not mapped. Cannot call msync().\"}", filename);
        pthread_mutex_unlock(&g_mm_mutex);
        return -1;
    }

    int flags = is_async ? MS_ASYNC : (MS_SYNC | MS_INVALIDATE);

    /* System Call: msync() */
    int res = msync(entry->mapped_addr, entry->mapped_size, flags);
    if (res != 0) {
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"msync() failed: %s\"}", strerror(errno));
        pthread_mutex_unlock(&g_mm_mutex);
        return -1;
    }

    entry->is_dirty = 0;
    entry->last_sync_time = time(NULL);

    snprintf(json_out, max_len,
        "{\"success\":true,\"message\":\"Memory-mapped pages synchronized with disk\","
        "\"filename\":\"%s\",\"mapped_address\":\"0x%lx\",\"size\":%zu,"
        "\"sync_mode\":\"%s\",\"is_dirty\":false,\"syscalls\":[\"msync\"]}",
        filename,
        (uintptr_t)entry->mapped_addr,
        entry->mapped_size,
        is_async ? "MS_ASYNC" : "MS_SYNC | MS_INVALIDATE"
    );

    pthread_mutex_unlock(&g_mm_mutex);
    return 0;
}

/* POST /api/unmap - Unmap file using munmap() and close fd */
int mm_unmap_file(const char *filename, char *json_out, size_t max_len) {
    if (!mm_validate_filename(filename)) {
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"Invalid filename\"}");
        return -1;
    }

    pthread_mutex_lock(&g_mm_mutex);
    MappedFileEntry *entry = mm_find_entry(filename);

    if (entry == NULL || !entry->is_mapped) {
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"File '%s' is not currently mapped.\"}", filename);
        pthread_mutex_unlock(&g_mm_mutex);
        return -1;
    }

    /* Automatically sync dirty pages before unmapping if dirty */
    if (entry->is_dirty) {
        msync(entry->mapped_addr, entry->mapped_size, MS_SYNC);
    }

    void *unmapped_addr = entry->mapped_addr;
    size_t unmapped_size = entry->mapped_size;
    int fd = entry->fd;

    /* System Call: munmap() */
    int res = munmap(entry->mapped_addr, entry->mapped_size);
    if (res != 0) {
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"munmap() failed: %s\"}", strerror(errno));
        pthread_mutex_unlock(&g_mm_mutex);
        return -1;
    }

    /* System Call: close() */
    if (fd >= 0) {
        close(fd);
    }

    entry->is_mapped = 0;
    entry->mapped_addr = NULL;
    entry->mapped_size = 0;
    entry->fd = -1;
    entry->is_dirty = 0;

    snprintf(json_out, max_len,
        "{\"success\":true,\"message\":\"File unmapped and descriptor closed successfully\","
        "\"filename\":\"%s\",\"unmapped_address\":\"0x%lx\",\"unmapped_size\":%zu,"
        "\"syscalls\":[\"msync\",\"munmap\",\"close\"]}",
        filename, (uintptr_t)unmapped_addr, unmapped_size);

    pthread_mutex_unlock(&g_mm_mutex);
    return 0;
}

/* POST /api/delete - Delete file using unlink() */
int mm_delete_file(const char *filename, char *json_out, size_t max_len) {
    if (!mm_validate_filename(filename)) {
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"Invalid filename\"}");
        return -1;
    }

    char path[MAX_PATH_LEN];
    mm_get_safe_path(filename, path, sizeof(path));

    pthread_mutex_lock(&g_mm_mutex);
    MappedFileEntry *entry = mm_find_entry(filename);

    /* If currently mapped, unmap first */
    if (entry != NULL && entry->is_mapped) {
        munmap(entry->mapped_addr, entry->mapped_size);
        if (entry->fd >= 0) close(entry->fd);
        entry->is_mapped = 0;
        entry->mapped_addr = NULL;
    }

    /* System Call: unlink() */
    if (unlink(path) != 0) {
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"unlink() failed: %s\"}", strerror(errno));
        pthread_mutex_unlock(&g_mm_mutex);
        return -1;
    }

    snprintf(json_out, max_len,
        "{\"success\":true,\"message\":\"File deleted successfully from disk\","
        "\"filename\":\"%s\",\"syscalls\":[\"unlink\"]}", filename);

    pthread_mutex_unlock(&g_mm_mutex);
    return 0;
}

/* GET /api/info - Detailed Linux metadata using stat(), mincore(), etc. */
int mm_file_info(const char *filename, char *json_out, size_t max_len) {
    if (!mm_validate_filename(filename)) {
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"Invalid filename\"}");
        return -1;
    }

    char path[MAX_PATH_LEN];
    mm_get_safe_path(filename, path, sizeof(path));

    pthread_mutex_lock(&g_mm_mutex);

    struct stat st;
    /* System Call: stat() */
    if (stat(path, &st) != 0) {
        snprintf(json_out, max_len, "{\"success\":false,\"error\":\"stat() failed: %s\"}", strerror(errno));
        pthread_mutex_unlock(&g_mm_mutex);
        return -1;
    }

    MappedFileEntry *entry = mm_find_entry(filename);
    char perm_str[16];
    format_permissions(st.st_mode, perm_str);

    size_t total_pages = (st.st_size > 0) ? ((st.st_size + g_page_size - 1) / g_page_size) : 0;
    size_t resident_pages = 0;

    /* Linux mincore() system call: determines whether pages are resident in physical RAM */
    if (entry != NULL && entry->is_mapped && entry->mapped_addr != NULL && entry->mapped_size > 0) {
        size_t num_pages = (entry->mapped_size + g_page_size - 1) / g_page_size;
        unsigned char *vec = calloc(num_pages, 1);
        if (vec) {
            if (mincore(entry->mapped_addr, entry->mapped_size, vec) == 0) {
                for (size_t p = 0; p < num_pages; ++p) {
                    if (vec[p] & 1) resident_pages++;
                }
            }
            free(vec);
        }
    }

    char esc_name[MAX_FILENAME_LEN * 2];
    escape_json_string(filename, esc_name, sizeof(esc_name));

    if (entry != NULL && entry->is_mapped) {
        snprintf(json_out, max_len,
            "{\"success\":true,\"filename\":\"%s\",\"is_mapped\":true,"
            "\"mapped_address\":\"0x%lx\",\"virtual_range\":\"0x%lx - 0x%lx\","
            "\"mapped_size\":%zu,\"fd\":%d,\"is_dirty\":%s,"
            "\"protection\":\"%s\",\"flags\":\"%s\","
            "\"stat\":{\"size\":%lld,\"inode\":%llu,\"mode\":\"%s\",\"octal\":\"%04o\","
            "\"hard_links\":%lu,\"uid\":%u,\"gid\":%u,\"blocks\":%lld,\"block_size\":%ld,"
            "\"atime\":%ld,\"mtime\":%ld,\"ctime\":%ld},"
            "\"vm_info\":{\"page_size\":%ld,\"total_pages\":%zu,\"resident_in_ram_pages\":%zu,"
            "\"write_count\":%zu,\"last_sync\":%ld},"
            "\"syscalls\":[\"stat\",\"fstat\",\"mincore\"]}",
            esc_name,
            (uintptr_t)entry->mapped_addr,
            (uintptr_t)entry->mapped_addr,
            (uintptr_t)entry->mapped_addr + entry->mapped_size,
            entry->mapped_size,
            entry->fd,
            entry->is_dirty ? "true" : "false",
            (entry->prot & PROT_WRITE) ? "PROT_READ | PROT_WRITE" : "PROT_READ",
            (entry->flags & MAP_SHARED) ? "MAP_SHARED" : "MAP_PRIVATE",
            (long long)st.st_size,
            (unsigned long long)st.st_ino,
            perm_str,
            st.st_mode & 0777,
            (unsigned long)st.st_nlink,
            (unsigned int)st.st_uid,
            (unsigned int)st.st_gid,
            (long long)st.st_blocks,
            (long)st.st_blksize,
            (long)st.st_atime,
            (long)st.st_mtime,
            (long)st.st_ctime,
            g_page_size,
            total_pages,
            resident_pages,
            entry->write_count,
            (long)entry->last_sync_time
        );
    } else {
        snprintf(json_out, max_len,
            "{\"success\":true,\"filename\":\"%s\",\"is_mapped\":false,"
            "\"mapped_address\":null,\"virtual_range\":null,\"mapped_size\":0,\"fd\":-1,\"is_dirty\":false,"
            "\"stat\":{\"size\":%lld,\"inode\":%llu,\"mode\":\"%s\",\"octal\":\"%04o\","
            "\"hard_links\":%lu,\"uid\":%u,\"gid\":%u,\"blocks\":%lld,\"block_size\":%ld,"
            "\"atime\":%ld,\"mtime\":%ld,\"ctime\":%ld},"
            "\"vm_info\":{\"page_size\":%ld,\"total_pages\":%zu,\"resident_in_ram_pages\":0},"
            "\"syscalls\":[\"stat\"]}",
            esc_name,
            (long long)st.st_size,
            (unsigned long long)st.st_ino,
            perm_str,
            st.st_mode & 0777,
            (unsigned long)st.st_nlink,
            (unsigned int)st.st_uid,
            (unsigned int)st.st_gid,
            (long long)st.st_blocks,
            (long)st.st_blksize,
            (long)st.st_atime,
            (long)st.st_mtime,
            (long)st.st_ctime,
            g_page_size,
            total_pages
        );
    }

    pthread_mutex_unlock(&g_mm_mutex);
    return 0;
}

/* GET /api/stats - Global system statistics */
int mm_system_stats(char *json_out, size_t max_len) {
    pthread_mutex_lock(&g_mm_mutex);
    size_t active_count = 0;
    size_t total_mapped_bytes = 0;
    size_t dirty_count = 0;

    for (int i = 0; i < MAX_ACTIVE_MAPS; ++i) {
        if (g_mapped_table[i].is_mapped) {
            active_count++;
            total_mapped_bytes += g_mapped_table[i].mapped_size;
            if (g_mapped_table[i].is_dirty) dirty_count++;
        }
    }

    snprintf(json_out, max_len,
        "{\"success\":true,\"active_mappings\":%zu,\"total_mapped_bytes\":%zu,"
        "\"dirty_mappings\":%zu,\"system_page_size\":%ld,\"max_allowed_mappings\":%d}",
        active_count, total_mapped_bytes, dirty_count, g_page_size, MAX_ACTIVE_MAPS);

    pthread_mutex_unlock(&g_mm_mutex);
    return 0;
}
