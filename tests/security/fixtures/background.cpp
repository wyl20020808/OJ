#include <iostream>
#include <unistd.h>
int main() {
  pid_t child = fork();
  if (child == 0) { sleep(30); _exit(0); }
  if (child < 0) return 2;
  std::cout << "BACKGROUND_CHILD_STARTED\n";
  return 0;
}
