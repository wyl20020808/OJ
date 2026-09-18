#include <csignal>
int main() {
  raise(SIGSEGV);
  return 1;
}
