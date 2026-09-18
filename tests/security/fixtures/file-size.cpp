#include <fcntl.h>
#include <unistd.h>

#include <array>
#include <cerrno>
#include <iostream>

int main() {
  int descriptor = open("/workspace/file-size-probe", O_CREAT | O_WRONLY | O_TRUNC, 0600);
  if (descriptor < 0) return 2;
  std::array<char, 4096> block{};
  for (int index = 0; index < 384; ++index) {
    if (write(descriptor, block.data(), block.size()) != static_cast<ssize_t>(block.size())) {
      int failure = errno;
      close(descriptor);
      std::cout << "FSIZE_ERRNO=" << failure << '\n';
      return failure == EFBIG ? 0 : 4;
    }
  }
  close(descriptor);
  return 3;
}
