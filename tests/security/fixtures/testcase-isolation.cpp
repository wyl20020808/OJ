#include <fstream>
#include <iostream>
#include <string>
#include <sys/stat.h>
int main() {
  std::string mode;
  std::cin >> mode;
  if (mode == "A") {
    std::ofstream("/workspace/case-canary") << "case-a";
    std::cout << "CASE_A_WRITTEN\n";
    return 0;
  }
  struct stat value {};
  std::cout << (stat("/workspace/case-canary", &value) == 0 ? "CASE_B_LEAKED\n" : "CASE_B_ISOLATED\n");
  return 0;
}
