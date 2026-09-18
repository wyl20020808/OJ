#include <unistd.h>
#include <string>
int main() {
  std::string output(131072, 'O');
  write(STDOUT_FILENO, output.data(), output.size());
  return 0;
}
