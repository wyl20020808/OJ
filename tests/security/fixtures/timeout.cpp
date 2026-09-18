int main() {
  volatile unsigned long long value = 0;
  for (;;) value = value * 1664525ULL + 1013904223ULL;
}
