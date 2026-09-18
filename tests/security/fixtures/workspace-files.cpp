#include <fcntl.h>
#include <unistd.h>

#include <array>
#include <cstdio>

int main() {
  std::array<char, 4096> block{};
  int created = 0;
  for (int index = 0; index < 400; ++index) {
    char path[64];
    std::snprintf(path, sizeof(path), "/workspace/small-%03d", index);
    int descriptor = open(path, O_CREAT | O_EXCL | O_WRONLY, 0600);
    if (descriptor < 0) break;
    ssize_t written = write(descriptor, block.data(), block.size());
    close(descriptor);
    if (written != static_cast<ssize_t>(block.size())) break;
    ++created;
  }
  return created < 400 && created >= 32 ? 0 : 1;
}
