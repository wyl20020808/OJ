#include <fcntl.h>
#include <unistd.h>

#include <iostream>
#include <vector>

int main() {
  std::vector<int> descriptors;
  for (int index = 0; index < 80; ++index) {
    int descriptor = open("/dev/null", O_RDONLY);
    if (descriptor < 0) break;
    descriptors.push_back(descriptor);
  }
  for (int descriptor : descriptors) close(descriptor);
  std::cout << "NOFILE_OPENED=" << descriptors.size() << '\n';
  return descriptors.size() < 80 && descriptors.size() >= 32 ? 0 : 1;
}
