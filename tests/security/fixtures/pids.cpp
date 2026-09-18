#include <sys/wait.h>
#include <unistd.h>
#include <vector>
int main() {
  std::vector<pid_t> children;
  for (int index = 0; index < 64; ++index) {
    pid_t child = fork();
    if (child < 0) break;
    if (child == 0) { usleep(500000); _exit(0); }
    children.push_back(child);
  }
  for (pid_t child : children) waitpid(child, nullptr, 0);
  return 0;
}
