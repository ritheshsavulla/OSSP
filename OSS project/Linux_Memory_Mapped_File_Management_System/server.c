#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <signal.h>
#include <pthread.h>
#include <ctype.h>
#include <fcntl.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>

#include "memory_manager.h"

#define DEFAULT_PORT 8080
#define BUFFER_SIZE 65536
#define MAX_PAYLOAD_SIZE 1048576 /* 1 MB */
#define WEB_DIR "./web"

static volatile sig_atomic_t g_running = 1;
static int g_server_fd = -1;

/* Signal handler for clean shutdown */
static void handle_signal(int sig) {
    (void)sig;
    g_running = 0;
    if (g_server_fd >= 0) {
        close(g_server_fd);
        g_server_fd = -1;
    }
}

/* Minimalist robust JSON field extractors (self-contained, no external deps) */
static int json_extract_string(const char *json, const char *key, char *out, size_t max_out) {
    if (!json || !key || !out || max_out == 0) return 0;
    char search_pattern[128];
    snprintf(search_pattern, sizeof(search_pattern), "\"%s\"", key);

    const char *pos = strstr(json, search_pattern);
    if (!pos) return 0;
    pos += strlen(search_pattern);

    while (*pos && (isspace((unsigned char)*pos) || *pos == ':')) {
        pos++;
    }

    if (*pos != '\"') return 0;
    pos++; /* skip opening quote */

    size_t idx = 0;
    while (*pos && *pos != '\"' && idx + 1 < max_out) {
        if (*pos == '\\' && *(pos + 1) != '\0') {
            pos++;
            if (*pos == 'n') out[idx++] = '\n';
            else if (*pos == 'r') out[idx++] = '\r';
            else if (*pos == 't') out[idx++] = '\t';
            else if (*pos == '\"') out[idx++] = '\"';
            else if (*pos == '\\') out[idx++] = '\\';
            else out[idx++] = *pos;
        } else {
            out[idx++] = *pos;
        }
        pos++;
    }
    out[idx] = '\0';
    return 1;
}

static int json_extract_int(const char *json, const char *key, long long *val) {
    if (!json || !key || !val) return 0;
    char search_pattern[128];
    snprintf(search_pattern, sizeof(search_pattern), "\"%s\"", key);

    const char *pos = strstr(json, search_pattern);
    if (!pos) return 0;
    pos += strlen(search_pattern);

    while (*pos && (isspace((unsigned char)*pos) || *pos == ':')) {
        pos++;
    }

    char *endptr;
    *val = strtoll(pos, &endptr, 10);
    return (endptr != pos);
}

static int json_extract_bool(const char *json, const char *key, int *val) {
    if (!json || !key || !val) return 0;
    char search_pattern[128];
    snprintf(search_pattern, sizeof(search_pattern), "\"%s\"", key);

    const char *pos = strstr(json, search_pattern);
    if (!pos) return 0;
    pos += strlen(search_pattern);

    while (*pos && (isspace((unsigned char)*pos) || *pos == ':')) {
        pos++;
    }

    if (strncmp(pos, "true", 4) == 0) {
        *val = 1;
        return 1;
    } else if (strncmp(pos, "false", 5) == 0) {
        *val = 0;
        return 1;
    }
    return 0;
}

/* HTTP response helper */
static void send_http_response(int client_fd, int status_code, const char *content_type, const char *body, size_t body_len) {
    const char *status_text = "OK";
    if (status_code == 400) status_text = "Bad Request";
    else if (status_code == 404) status_text = "Not Found";
    else if (status_code == 405) status_text = "Method Not Allowed";
    else if (status_code == 500) status_text = "Internal Server Error";

    char header[1024];
    int header_len = snprintf(header, sizeof(header),
        "HTTP/1.1 %d %s\r\n"
        "Content-Type: %s\r\n"
        "Content-Length: %zu\r\n"
        "Connection: close\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
        "Access-Control-Allow-Headers: Content-Type\r\n"
        "\r\n",
        status_code, status_text, content_type, body_len);

    ssize_t sent_h = write(client_fd, header, header_len);
    (void)sent_h;
    if (body && body_len > 0) {
        ssize_t sent_b = write(client_fd, body, body_len);
        (void)sent_b;
    }
}

/* Serve static frontend assets from web/ directory */
static void serve_static_file(int client_fd, const char *requested_path, int is_head) {
    const char *filepath = "web/index.html";
    const char *mime = "text/html; charset=utf-8";

    if (strcmp(requested_path, "/") == 0 || strcmp(requested_path, "/index.html") == 0) {
        filepath = "web/index.html";
        mime = "text/html; charset=utf-8";
    } else if (strcmp(requested_path, "/style.css") == 0 || strcmp(requested_path, "/web/style.css") == 0) {
        filepath = "web/style.css";
        mime = "text/css; charset=utf-8";
    } else if (strcmp(requested_path, "/script.js") == 0 || strcmp(requested_path, "/web/script.js") == 0) {
        filepath = "web/script.js";
        mime = "application/javascript; charset=utf-8";
    } else {
        const char *not_found = "{\"error\":\"404 Not Found\"}";
        send_http_response(client_fd, 404, "application/json", not_found, strlen(not_found));
        return;
    }

    int fd = open(filepath, O_RDONLY);
    if (fd < 0) {
        char err_msg[256];
        snprintf(err_msg, sizeof(err_msg), "{\"error\":\"File not found on server: %s\"}", filepath);
        send_http_response(client_fd, 404, "application/json", err_msg, strlen(err_msg));
        return;
    }

    struct stat st;
    if (fstat(fd, &st) != 0) {
        close(fd);
        const char *err = "{\"error\":\"fstat error\"}";
        send_http_response(client_fd, 500, "application/json", err, strlen(err));
        return;
    }

    if (is_head) {
        close(fd);
        send_http_response(client_fd, 200, mime, NULL, (size_t)st.st_size);
        return;
    }

    /* Read and send */
    char *buf = malloc(st.st_size);
    if (!buf) {
        close(fd);
        const char *err = "{\"error\":\"Out of memory\"}";
        send_http_response(client_fd, 500, "application/json", err, strlen(err));
        return;
    }

    ssize_t r = read(fd, buf, st.st_size);
    close(fd);

    if (r >= 0) {
        send_http_response(client_fd, 200, mime, buf, (size_t)r);
    } else {
        const char *err = "{\"error\":\"Read failed\"}";
        send_http_response(client_fd, 500, "application/json", err, strlen(err));
    }

    free(buf);
}

/* Worker thread argument structure */
typedef struct {
    int client_fd;
} ClientContext;

/* Handle incoming client connection */
static void *client_worker(void *arg) {
    ClientContext *ctx = (ClientContext *)arg;
    int client_fd = ctx->client_fd;
    free(ctx);

    char *req_buffer = malloc(BUFFER_SIZE);
    if (!req_buffer) {
        close(client_fd);
        return NULL;
    }

    ssize_t total_read = 0;
    ssize_t bytes_read = 0;
    while ((bytes_read = read(client_fd, req_buffer + total_read, BUFFER_SIZE - 1 - total_read)) > 0) {
        total_read += bytes_read;
        req_buffer[total_read] = '\0';
        if (strstr(req_buffer, "\r\n\r\n") != NULL) {
            break; /* Headers fully received */
        }
        if (total_read >= BUFFER_SIZE - 1) break;
    }

    if (total_read <= 0) {
        free(req_buffer);
        close(client_fd);
        return NULL;
    }

    /* Parse request line */
    char method[16] = {0};
    char uri[512] = {0};
    char version[16] = {0};
    sscanf(req_buffer, "%15s %511s %15s", method, uri, version);

    /* Separate URI path from query string */
    char path[512] = {0};
    char query[512] = {0};
    char *qmark = strchr(uri, '?');
    if (qmark) {
        size_t path_len = (size_t)(qmark - uri);
        if (path_len >= sizeof(path)) path_len = sizeof(path) - 1;
        memcpy(path, uri, path_len);
        path[path_len] = '\0';
        snprintf(query, sizeof(query), "%s", qmark + 1);
    } else {
        snprintf(path, sizeof(path), "%s", uri);
    }

    /* Handle CORS preflight OPTIONS request */
    if (strcmp(method, "OPTIONS") == 0) {
        send_http_response(client_fd, 200, "text/plain", "", 0);
        free(req_buffer);
        close(client_fd);
        return NULL;
    }

    /* Find start of HTTP body */
    char *body_start = strstr(req_buffer, "\r\n\r\n");
    if (body_start) {
        body_start += 4;
    } else {
        body_start = "";
    }

    /* Check Content-Length to see if more body needs reading */
    size_t content_length = 0;
    char *cl_header = strcasestr(req_buffer, "Content-Length:");
    if (cl_header) {
        content_length = (size_t)strtoul(cl_header + 15, NULL, 10);
    }

    /* Allocate larger buffer if body exceeds what we initially read */
    size_t current_body_len = strlen(body_start);
    char *full_body = NULL;
    if (content_length > current_body_len && content_length < MAX_PAYLOAD_SIZE) {
        full_body = malloc(content_length + 1);
        if (full_body) {
            memcpy(full_body, body_start, current_body_len);
            size_t remaining = content_length - current_body_len;
            size_t body_read_idx = current_body_len;
            while (remaining > 0) {
                ssize_t b = read(client_fd, full_body + body_read_idx, remaining);
                if (b <= 0) break;
                body_read_idx += b;
                remaining -= b;
            }
            full_body[body_read_idx] = '\0';
            body_start = full_body;
        }
    }

    /* Allocate output JSON buffer */
    char *json_res = malloc(BUFFER_SIZE);
    if (!json_res) {
        const char *err = "{\"error\":\"Server out of memory\"}";
        send_http_response(client_fd, 500, "application/json", err, strlen(err));
        if (full_body) free(full_body);
        free(req_buffer);
        close(client_fd);
        return NULL;
    }
    json_res[0] = '\0';

    /* Route handler */
    int is_head = (strcmp(method, "HEAD") == 0);
    if (strcmp(method, "GET") == 0 || is_head) {
        if (strcmp(path, "/api/files") == 0) {
            mm_list_files(json_res, BUFFER_SIZE);
            send_http_response(client_fd, 200, "application/json; charset=utf-8", is_head ? NULL : json_res, strlen(json_res));
        } else if (strcmp(path, "/api/stats") == 0) {
            mm_system_stats(json_res, BUFFER_SIZE);
            send_http_response(client_fd, 200, "application/json; charset=utf-8", is_head ? NULL : json_res, strlen(json_res));
        } else if (strcmp(path, "/api/info") == 0) {
            char filename[512] = {0};
            if (strncmp(query, "file=", 5) == 0) {
                snprintf(filename, sizeof(filename), "%s", query + 5);
            }
            mm_file_info(filename, json_res, BUFFER_SIZE);
            send_http_response(client_fd, 200, "application/json; charset=utf-8", is_head ? NULL : json_res, strlen(json_res));
        } else {
            /* Serve static files (HTML, CSS, JS) */
            serve_static_file(client_fd, path, is_head);
        }
    } else if (strcmp(method, "POST") == 0) {
        if (strcmp(path, "/api/create") == 0) {
            char filename[MAX_FILENAME_LEN] = {0};
            long long initial_size = 0;
            char initial_content[8192] = {0};

            json_extract_string(body_start, "filename", filename, sizeof(filename));
            json_extract_int(body_start, "size", &initial_size);
            json_extract_string(body_start, "content", initial_content, sizeof(initial_content));

            mm_create_file(filename, (size_t)initial_size, initial_content, json_res, BUFFER_SIZE);
            send_http_response(client_fd, 200, "application/json; charset=utf-8", json_res, strlen(json_res));

        } else if (strcmp(path, "/api/map") == 0) {
            char filename[MAX_FILENAME_LEN] = {0};
            char prot[32] = "rw";
            char flags[32] = "shared";

            json_extract_string(body_start, "filename", filename, sizeof(filename));
            json_extract_string(body_start, "prot", prot, sizeof(prot));
            json_extract_string(body_start, "flags", flags, sizeof(flags));

            mm_map_file(filename, prot, flags, json_res, BUFFER_SIZE);
            send_http_response(client_fd, 200, "application/json; charset=utf-8", json_res, strlen(json_res));

        } else if (strcmp(path, "/api/read") == 0) {
            char filename[MAX_FILENAME_LEN] = {0};
            long long offset = 0;
            long long length = 0;

            json_extract_string(body_start, "filename", filename, sizeof(filename));
            json_extract_int(body_start, "offset", &offset);
            json_extract_int(body_start, "length", &length);

            mm_read_file(filename, (size_t)offset, (size_t)length, json_res, BUFFER_SIZE);
            send_http_response(client_fd, 200, "application/json; charset=utf-8", json_res, strlen(json_res));

        } else if (strcmp(path, "/api/write") == 0) {
            char filename[MAX_FILENAME_LEN] = {0};
            long long offset = 0;
            char content[32768] = {0};

            json_extract_string(body_start, "filename", filename, sizeof(filename));
            json_extract_int(body_start, "offset", &offset);
            json_extract_string(body_start, "content", content, sizeof(content));

            mm_write_file(filename, (size_t)offset, content, strlen(content), json_res, BUFFER_SIZE);
            send_http_response(client_fd, 200, "application/json; charset=utf-8", json_res, strlen(json_res));

        } else if (strcmp(path, "/api/resize") == 0) {
            char filename[MAX_FILENAME_LEN] = {0};
            long long new_size = 0;

            json_extract_string(body_start, "filename", filename, sizeof(filename));
            json_extract_int(body_start, "new_size", &new_size);

            mm_resize_file(filename, (size_t)new_size, json_res, BUFFER_SIZE);
            send_http_response(client_fd, 200, "application/json; charset=utf-8", json_res, strlen(json_res));

        } else if (strcmp(path, "/api/sync") == 0) {
            char filename[MAX_FILENAME_LEN] = {0};
            int is_async = 0;

            json_extract_string(body_start, "filename", filename, sizeof(filename));
            json_extract_bool(body_start, "async", &is_async);

            mm_sync_file(filename, is_async, json_res, BUFFER_SIZE);
            send_http_response(client_fd, 200, "application/json; charset=utf-8", json_res, strlen(json_res));

        } else if (strcmp(path, "/api/unmap") == 0) {
            char filename[MAX_FILENAME_LEN] = {0};
            json_extract_string(body_start, "filename", filename, sizeof(filename));

            mm_unmap_file(filename, json_res, BUFFER_SIZE);
            send_http_response(client_fd, 200, "application/json; charset=utf-8", json_res, strlen(json_res));

        } else if (strcmp(path, "/api/delete") == 0) {
            char filename[MAX_FILENAME_LEN] = {0};
            json_extract_string(body_start, "filename", filename, sizeof(filename));

            mm_delete_file(filename, json_res, BUFFER_SIZE);
            send_http_response(client_fd, 200, "application/json; charset=utf-8", json_res, strlen(json_res));

        } else if (strcmp(path, "/api/info") == 0) {
            char filename[MAX_FILENAME_LEN] = {0};
            json_extract_string(body_start, "filename", filename, sizeof(filename));

            mm_file_info(filename, json_res, BUFFER_SIZE);
            send_http_response(client_fd, 200, "application/json; charset=utf-8", json_res, strlen(json_res));

        } else {
            const char *not_found = "{\"error\":\"API endpoint not found\"}";
            send_http_response(client_fd, 404, "application/json", not_found, strlen(not_found));
        }
    } else {
        const char *not_allowed = "{\"error\":\"Method not allowed\"}";
        send_http_response(client_fd, 405, "application/json", not_allowed, strlen(not_allowed));
    }

    if (full_body) free(full_body);
    free(json_res);
    free(req_buffer);
    close(client_fd);
    return NULL;
}

int main(int argc, char *argv[]) {
    int port = DEFAULT_PORT;
    if (argc >= 2) {
        port = atoi(argv[1]);
        if (port <= 0 || port > 65535) port = DEFAULT_PORT;
    }

    /* Setup signal handling */
    signal(SIGINT, handle_signal);
    signal(SIGTERM, handle_signal);
    signal(SIGPIPE, SIG_IGN); /* Avoid crash if client closes connection abruptly */

    /* Initialize Memory Manager */
    mm_init();

    /* Create TCP POSIX Socket */
    g_server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (g_server_fd < 0) {
        perror("[ERROR] socket() failed");
        exit(EXIT_FAILURE);
    }

    int opt = 1;
    if (setsockopt(g_server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) < 0) {
        perror("[WARNING] setsockopt SO_REUSEADDR failed");
    }

    struct sockaddr_in server_addr;
    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons((uint16_t)port);

    if (bind(g_server_fd, (struct sockaddr *)&server_addr, sizeof(server_addr)) < 0) {
        perror("[ERROR] bind() failed");
        close(g_server_fd);
        exit(EXIT_FAILURE);
    }

    if (listen(g_server_fd, 64) < 0) {
        perror("[ERROR] listen() failed");
        close(g_server_fd);
        exit(EXIT_FAILURE);
    }

    printf("\n====================================================================\n");
    printf("   LINUX MEMORY-MAPPED FILE MANAGEMENT SYSTEM (OSSP LAB PROJECT)    \n");
    printf("====================================================================\n");
    printf(" [*] Process ID (PID)      : %d\n", getpid());
    printf(" [*] Linux Page Size       : %ld bytes (%.1f KB)\n", sysconf(_SC_PAGESIZE), sysconf(_SC_PAGESIZE) / 1024.0);
    printf(" [*] Data Storage Dir      : %s/\n", DATA_DIR);
    printf(" [*] Web Static Dir        : %s/\n", WEB_DIR);
    printf(" [*] Server URL            : http://localhost:%d\n", port);
    printf(" [*] System Calls Active   : mmap, munmap, msync, mincore, fstat,\n");
    printf("                             ftruncate, lseek, open, close, read, write\n");
    printf("====================================================================\n");
    printf(" [✓] HTTP Server listening on 0.0.0.0:%d ...\n", port);
    printf(" [✓] Press Ctrl+C to safely unmap all regions and stop the server.\n\n");

    while (g_running) {
        struct sockaddr_in client_addr;
        socklen_t client_len = sizeof(client_addr);
        int client_fd = accept(g_server_fd, (struct sockaddr *)&client_addr, &client_len);

        if (client_fd < 0) {
            if (!g_running) break;
            if (errno == EINTR) continue;
            perror("[WARNING] accept() error");
            continue;
        }

        ClientContext *ctx = malloc(sizeof(ClientContext));
        if (!ctx) {
            close(client_fd);
            continue;
        }
        ctx->client_fd = client_fd;

        pthread_t tid;
        pthread_attr_t attr;
        pthread_attr_init(&attr);
        pthread_attr_setdetachstate(&attr, PTHREAD_CREATE_DETACHED);

        if (pthread_create(&tid, &attr, client_worker, ctx) != 0) {
            perror("[WARNING] pthread_create() failed");
            close(client_fd);
            free(ctx);
        }
        pthread_attr_destroy(&attr);
    }

    printf("\n[INFO] Graceful shutdown initiated. Cleaning up mapped memory regions...\n");
    mm_cleanup();
    if (g_server_fd >= 0) {
        close(g_server_fd);
    }
    printf("[INFO] All mappings unmapped. Server stopped cleanly.\n");

    return 0;
}
