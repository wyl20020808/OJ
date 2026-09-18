#if __has_include("PHASE6B5_HOST_CANARY_PATH")
#error "host canary visible during compilation"
#endif
#if __has_include("PHASE6B5_SIBLING_CANARY_PATH")
#error "sibling canary visible during compilation"
#endif
#if __has_include("/var/run/docker.sock")
#error "Docker socket visible during compilation"
#endif

#include <arpa/inet.h>
#include <dirent.h>
#include <netdb.h>
#include <sys/mount.h>
#include <sys/ptrace.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/utsname.h>
#include <unistd.h>
#include <fcntl.h>

#include <cerrno>
#include <cstring>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

extern char **environ;

static bool exists(const char *path) {
  struct stat value {};
  return stat(path, &value) == 0;
}

static bool connectTo(int port) {
  int descriptor = socket(AF_INET, SOCK_STREAM, 0);
  if (descriptor < 0) return false;
  sockaddr_in address {};
  address.sin_family = AF_INET;
  address.sin_port = htons(static_cast<uint16_t>(port));
  inet_pton(AF_INET, "127.0.0.1", &address.sin_addr);
  timeval timeout {0, 100000};
  setsockopt(descriptor, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
  bool connected = connect(descriptor, reinterpret_cast<sockaddr *>(&address), sizeof(address)) == 0;
  close(descriptor);
  return connected;
}

static std::string statusValue(const std::string &name) {
  std::ifstream input("/proc/self/status");
  std::string line;
  while (std::getline(input, line)) {
    if (line.rfind(name + ":", 0) == 0) {
      auto value = line.substr(name.size() + 1);
      auto first = value.find_first_not_of(" \t");
      return first == std::string::npos ? "" : value.substr(first);
    }
  }
  return "";
}

static int visiblePids() {
  DIR *directory = opendir("/proc");
  if (!directory) return -1;
  int count = 0;
  while (dirent *entry = readdir(directory)) {
    bool numeric = entry->d_name[0] != '\0';
    for (const char *value = entry->d_name; *value; ++value) numeric = numeric && *value >= '0' && *value <= '9';
    if (numeric) ++count;
  }
  closedir(directory);
  return count;
}

static bool sensitiveEnvironmentPresent() {
  const std::vector<std::string> names = {
      "OJ_PHASE6B5_FAKE_SECRET=", "DATABASE_URL=", "JUDGE_DATABASE_URL=", "REDIS_URL=",
      "REDIS_PASSWORD=", "JUDGE_SERVICE_TOKEN=", "JUDGE_NODE_TOKEN=", "MINIO_ROOT_PASSWORD=",
      "AWS_SECRET_ACCESS_KEY=", "DOCKER_HOST="};
  for (char **item = environ; item && *item; ++item) {
    std::string value(*item);
    for (const auto &name : names) if (value.rfind(name, 0) == 0) return true;
  }
  return false;
}

static void result(const std::string &name, bool pass) {
  std::cout << name << '=' << (pass ? "PASS" : "FAIL") << '\n';
}

int main() {
  result("guest_identity", getuid() == 0 && getgid() == 0);
  result("pid_namespace", getpid() == 1 && visiblePids() == 1);
  result("capabilities", statusValue("CapEff") == "0000000000000000" && statusValue("CapPrm") == "0000000000000000" && statusValue("CapBnd") == "0000000000000000");
  result("no_new_privs", statusValue("NoNewPrivs") == "1");
  result("seccomp", statusValue("Seccomp") == "2");
  result("credentials", !sensitiveEnvironmentPresent());

  bool forbiddenPaths = true;
  for (const char *path : {"/mnt/c", "/mnt/d", "/host", "/home", "/root", "/run/secrets", "/var/run/docker.sock", "PHASE6B5_HOST_CANARY_PATH", "PHASE6B5_SIBLING_CANARY_PATH", "/workspace/.git", "/dev/kmsg", "/dev/mem", "/dev/sda"}) forbiddenPaths = forbiddenPaths && !exists(path);
  result("filesystem", forbiddenPaths);

  int rootWrite = open("/phase6b5-root-write", O_CREAT | O_WRONLY, 0600);
  if (rootWrite >= 0) { close(rootWrite); unlink("/phase6b5-root-write"); }
  int etcWrite = open("/etc/phase6b5-write", O_CREAT | O_WRONLY, 0600);
  if (etcWrite >= 0) { close(etcWrite); unlink("/etc/phase6b5-write"); }
  result("rootfs_readonly", rootWrite < 0 && etcWrite < 0);

  unlink("/workspace/escape-link");
  bool linked = symlink("PHASE6B5_HOST_CANARY_PATH", "/workspace/escape-link") == 0;
  result("symlink_escape", linked && !exists("/workspace/escape-link"));
  unlink("/workspace/escape-link");
  result("path_traversal", !exists("/workspace/../../mnt/d/phase6b5-host-canary") && !exists("PHASE6B5_SIBLING_CANARY_PATH"));

  result("host_canary_network", !connectTo(19626));
  result("qualification_supervisor", !connectTo(19625));
  result("supervisor_loopback", !connectTo(19092));
  bool serviceNetwork = !connectTo(5432) && !connectTo(6379) && !connectTo(9000) && !connectTo(3100) && !connectTo(8080);
  result("service_network", serviceNetwork);
  addrinfo hints {};
  addrinfo *addresses = nullptr;
  int dns = getaddrinfo("judge-service", "3100", &hints, &addresses);
  if (addresses) freeaddrinfo(addresses);
  result("dns", dns != 0);

  result("mount_denied", mount("none", "/tmp", "tmpfs", 0, nullptr) != 0);
  result("ptrace_denied", ptrace(PTRACE_ATTACH, 1, nullptr, nullptr) == -1);
  result("proc_sys", !exists("/sys/kernel") && access("/proc/sys/kernel/hostname", W_OK) != 0);

  utsname identity {};
  bool utsReadable = uname(&identity) == 0 && std::strlen(identity.nodename) > 0;
  result("uts_namespace", utsReadable && sethostname("phase6b5", 8) != 0);
  return 0;
}
