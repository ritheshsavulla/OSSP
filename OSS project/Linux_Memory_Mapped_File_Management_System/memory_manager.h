#ifndef MEMORY_MANAGER_H
#define MEMORY_MANAGER_H

#include <stddef.h>
#include <sys/types.h>
#include <time.h>

#define MAX_ACTIVE_MAPS 64
#define MAX_FILENAME_LEN 256
#define MAX_PATH_LEN 512
#define DATA_DIR "./data"

/* Represents an active memory-mapped file */
typedef struct {
    char filename[MAX_FILENAME_LEN];
    char filepath[MAX_PATH_LEN];
    int fd;
    void *mapped_addr;       /* Virtual address returned by mmap() */
    size_t mapped_size;      /* Mapped memory byte size */
    int prot;                /* Memory protection flags (PROT_READ | PROT_WRITE) */
    int flags;               /* Mapping flags (MAP_SHARED) */
    int is_mapped;           /* 1 if active, 0 otherwise */
    int is_dirty;            /* 1 if modified in memory and un-synced */
    time_t map_time;         /* Timestamp when mapped */
    time_t last_sync_time;   /* Timestamp of last msync() */
    size_t write_count;      /* Number of write operations performed */
} MappedFileEntry;

/* Initialization and cleanup */
void mm_init(void);
void mm_cleanup(void);

/* Security helper */
int mm_validate_filename(const char *filename);
int mm_get_safe_path(const char *filename, char *out_path, size_t max_len);

/* Core Memory Manager operations */
int mm_list_files(char *json_out, size_t max_len);
int mm_create_file(const char *filename, size_t initial_size, const char *initial_content, char *json_out, size_t max_len);
int mm_map_file(const char *filename, const char *prot_str, const char *flags_str, char *json_out, size_t max_len);
int mm_read_file(const char *filename, size_t offset, size_t length, char *json_out, size_t max_len);
int mm_write_file(const char *filename, size_t offset, const char *content, size_t content_len, char *json_out, size_t max_len);
int mm_resize_file(const char *filename, size_t new_size, char *json_out, size_t max_len);
int mm_sync_file(const char *filename, int is_async, char *json_out, size_t max_len);
int mm_unmap_file(const char *filename, char *json_out, size_t max_len);
int mm_delete_file(const char *filename, char *json_out, size_t max_len);
int mm_file_info(const char *filename, char *json_out, size_t max_len);
int mm_system_stats(char *json_out, size_t max_len);

/* Internal lookup */
MappedFileEntry *mm_find_entry(const char *filename);

#endif /* MEMORY_MANAGER_H */
