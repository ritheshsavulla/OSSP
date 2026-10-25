# Makefile for Linux Memory-Mapped File Management System
# Operating Systems & System Programming (OSSP) Project

CC = gcc
CFLAGS = -Wall -Wextra -O2 -pthread -D_GNU_SOURCE
TARGET = memory_server
SRCS = server.c memory_manager.c
OBJS = $(SRCS:.c=.o)
DATA_DIR = data

.PHONY: all clean run setup

all: setup $(TARGET)

setup:
	@mkdir -p $(DATA_DIR)

$(TARGET): $(OBJS)
	$(CC) $(CFLAGS) -o $(TARGET) $(OBJS)
	@echo "=========================================================="
	@echo " Build Successful! Binary: ./$(TARGET)"
	@echo " Run with: ./$(TARGET) or ./start.sh"
	@echo " Access at: http://localhost:8080"
	@echo "=========================================================="

%.o: %.c memory_manager.h
	$(CC) $(CFLAGS) -c $< -o $@

run: all
	./$(TARGET)

clean:
	rm -f $(OBJS) $(TARGET)
	@echo "Cleaned build artifacts."
