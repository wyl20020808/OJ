#include <cstdlib>
#include <cstring>
#include <unistd.h>
#include <vector>
int main() {
  std::vector<void *> blocks;
  for (int index = 0; index < 96; ++index) {
    void *block = std::malloc(1 << 20);
    if (!block) break;
    std::memset(block, index, 1 << 20);
    blocks.push_back(block);
  }
  sleep(1);
  return blocks.size() >= 80 ? 0 : 2;
}
