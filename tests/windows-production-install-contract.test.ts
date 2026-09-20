import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const install = readFileSync('deploy/install-windows.ps1', 'utf8');
const bootstrap = readFileSync('deploy/bootstrap-windows.ps1', 'utf8');
const doctor = readFileSync('deploy/doctor-windows.ps1', 'utf8');
const webProxy = readFileSync('deploy/nginx/web.conf', 'utf8');
const landing = readFileSync('README.md', 'utf8');
const chinese = readFileSync('README.zh-CN.md', 'utf8');
const english = readFileSync('README.en.md', 'utf8');
const guide = readFileSync(
  'Docs/deployment/WINDOWS_ONE_COMMAND_DEPLOYMENT.md',
  'utf8',
);

const scripts = [
  'deploy/install-windows.ps1',
  'deploy/bootstrap-windows.ps1',
  'deploy/doctor-windows.ps1',
];

describe('Phase 7C Windows production bootstrap contract', () => {
  it('ships PowerShell 5.1 entry points that parse on Windows', () => {
    for (const script of scripts) expect(existsSync(script)).toBe(true);
    if (process.platform !== 'win32') return;

    for (const script of scripts) {
      const command = [
        '$tokens=$null;$errors=$null;',
        `[void][Management.Automation.Language.Parser]::ParseFile('${script}',[ref]$tokens,[ref]$errors);`,
        'if($errors.Count){$errors|%{$_.Message};exit 1}',
      ].join('');
      const result = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-Command', command],
        {
          encoding: 'utf8',
        },
      );
      expect(result.status, `${script}: ${result.stderr}${result.stdout}`).toBe(
        0,
      );
    }
  });

  it('treats Windows only as a bootstrap for the Linux installer', () => {
    expect(install).toContain('./deploy/install.sh --non-interactive');
    expect(install).toContain('./deploy/doctor.sh');
    expect(install).toContain("'/home/ojplatform/OJ'");
    expect(install).toContain('git clone --progress --recurse-submodules');
    expect(install).toContain('plugins/OnlineCodeEditor');
    for (const forbidden of [
      'docker compose up',
      'docker run',
      'postgres.exe',
      'redis-server.exe',
      'Docker Desktop',
    ]) {
      expect(install).not.toContain(forbidden);
    }
  });

  it('fails closed on unsupported Windows and resource boundaries', () => {
    expect(install).toContain("$architecture -ne 'AMD64'");
    expect(install).toContain('[int]$os.BuildNumber -lt 22000');
    expect(install).toContain('$memoryGiB -lt 4');
    expect(install).toContain('$diskGiB -lt 25');
    expect(install).toContain('$DistroName root filesystem');
    expect(install).toContain('df -B1 --output=avail /');
    expect(install).toContain('Hardware virtualization is unavailable');
    expect(install).toContain('Windows ARM64 is NOT QUALIFIED');
  });

  it('self-elevates and preserves validated installation arguments', () => {
    expect(install).toContain('-Verb RunAs');
    expect(install).toContain('$script:ScriptPath');
    expect(install).toContain("'DistroName', 'LinuxUser', 'LinuxRepoPath'");
    expect(install).toContain("[ValidatePattern('^[A-Za-z0-9._-]+$')]");
    expect(install).not.toContain('Start-Process cmd.exe');
  });

  it('uses Microsoft WSL2 and the advertised Ubuntu 24.04 distro', () => {
    expect(install).toContain("[string]$DistroName = 'Ubuntu-24.04'");
    expect(install).toContain(
      "@('--install', $DistroName, '--version', '2', '--no-launch')",
    );
    expect(install).toContain('& wsl.exe --list --online');
    expect(install).toContain("@('--set-version', $DistroName, '2')");
    expect(install).toContain('systemd=true');
    expect(install).toContain('ps -p 1 -o comm=');
  });

  it('has bounded secret-free reboot resume and idempotent startup tasks', () => {
    expect(install).toContain('$script:MaxResumeAttempts = 3');
    expect(install).toContain(
      "$script:ResumeTaskName = 'OJPlatform-Phase7C-Resume'",
    );
    expect(install).toContain(
      "$script:StartupTaskName = 'OJPlatform-WSL-Startup'",
    );
    expect(install).toContain('Register-ScheduledTask');
    expect(install).toContain('Unregister-ScheduledTask');
    expect(install).toContain('Remove-ResumeArtifacts');
    expect(install).toContain('-AtLogOn');
    expect(install).toContain('-MultipleInstances IgnoreNew');
    expect(install).not.toMatch(/password\s*=|token\s*=|secret\s*=/i);
    expect(install).not.toContain('NOPASSWD');
    expect(install).not.toContain('New-NetFirewallRule');
    expect(install).not.toContain('Set-NetFirewallProfile');
    expect(install).not.toContain('netsh');
  });

  it('streams bounded Linux setup progress without native quoting corruption', () => {
    expect(install).toContain('[Convert]::ToBase64String');
    expect(install).toContain('| base64 -d | /bin/bash');
    expect(install).toContain('Write-Host $line');
    expect(install).toContain('timeout --foreground 600 apt-get');
    expect(install).toContain('already installed; skipping package download');
  });

  it('re-resolves the API after an idempotent container recreate', () => {
    expect(webProxy).toContain('resolver 127.0.0.11');
    expect(webProxy).toContain('set $api_upstream http://api:3010');
    expect(webProxy).toContain('proxy_pass $api_upstream');
  });

  it('initializes Ubuntu without an interactive password or UNIX-user prompt', () => {
    expect(install).toContain("Invoke-Wsl 'root'");
    expect(install).toContain('useradd --create-home');
    expect(install).toContain('runuser -u');
    expect(install).not.toContain('Enter new UNIX username');
    expect(install).not.toContain('chpasswd');
    expect(install).not.toContain('passwd ');
  });

  it('uses localhost, validates health, and prints a stable result', () => {
    expect(install).toContain("$script:WebUrl = 'http://localhost:8080/'");
    expect(install).toContain("$script:ApiUrl = 'http://localhost:8080/ready'");
    expect(install).toContain('Wait-WindowsEndpoint');
    expect(install).toContain('OJPlatform installation completed.');
    expect(install).toContain('Windows bootstrap: PASS');
    expect(install).toContain('OnlineCodeEditor: healthy');
  });

  it('bootstraps Git only through winget or the official Git fallback', () => {
    expect(bootstrap).toContain('winget.exe');
    expect(bootstrap).toContain('Git.Git');
    expect(bootstrap).toContain('https://git-scm.com/download/win');
    expect(bootstrap).toContain('git clone --recurse-submodules');
    expect(bootstrap).not.toContain('choco');
    expect(bootstrap).not.toMatch(/Invoke-WebRequest|WebClient|curl.exe/);
  });

  it('ships a read-only Windows doctor with a machine-readable verdict', () => {
    expect(doctor).toContain('WINDOWS_DEPLOY_DOCTOR=PASS');
    expect(doctor).toContain('WINDOWS_DEPLOY_DOCTOR=FAIL');
    expect(doctor).toContain('./deploy/doctor.sh');
    expect(doctor).toContain('http://localhost:8080/');
    for (const forbidden of [
      'Register-ScheduledTask',
      'Unregister-ScheduledTask',
      'wsl.exe --install',
      'Restart-Computer',
      'docker compose up',
      'Set-Content',
      'Remove-Item',
    ]) {
      expect(doctor).not.toContain(forbidden);
    }
  });

  it('provides visible bilingual navigation without losing deployment guidance', () => {
    expect(landing).toContain('[简体中文](./README.md)');
    expect(landing).toContain('[English](./README.en.md)');
    expect(landing).toContain('[完整中文文档](./README.zh-CN.md)');
    expect(english).toContain('[简体中文](./README.md)');
    expect(english).toContain('[English](./README.en.md)');
    expect(chinese).toContain('[简体中文首页](./README.md)');
    expect(chinese).toContain('[English](./README.en.md)');
    expect(landing).toContain('.\\deploy\\install-windows.ps1');
    expect(landing).toContain('sudo ./deploy/install.sh');
    expect(chinese).toContain('## 6. Windows 一键部署');
    expect(english).toContain('## 6. Windows deployment');
    expect(guide).toContain('Windows 11 x86_64');
    expect(guide).toContain('Docker Desktop is not required');
    expect(guide).toContain('deploy/install.sh` remains authoritative');
  });

  it('makes Chinese the default GitHub landing language', () => {
    // GitHub renders README.md first: it must be readable Chinese, not an
    // English page with one hidden Chinese link.
    expect(landing).toMatch(/[\u4e00-\u9fff]/);
    const chineseLines = landing
      .split('\n')
      .filter((line) => /[\u4e00-\u9fff]/.test(line)).length;
    expect(chineseLines).toBeGreaterThan(20);
    expect(landing).toContain('# OJPlatform');
    for (const heading of [
      '## 功能特性',
      '## 快速开始',
      '### Ubuntu 24.04 x86_64 / Linux',
      '### Windows 11 x86_64',
      '## 部署状态',
    ])
      expect(landing).toContain(heading);
    expect(landing).not.toContain('\uFFFD');
  });

  it('keeps the English and full Chinese documents complete and linked', () => {
    expect(english).toMatch(/## 1\. Overview/);
    expect(english).toContain('git clone --recurse-submodules');
    expect(chinese).toMatch(/## 1\. 项目简介/);
    expect(chinese).toMatch(/[\u4e00-\u9fff]/);
    for (const readme of [landing, chinese, english])
      expect(readme).not.toMatch(/[A-Za-z]:\\\\/);
  });

  it('never claims Windows is production qualified', () => {
    for (const readme of [landing, chinese, english]) {
      expect(readme).toContain('Preview');
      for (const paragraph of readme.split(/\n{2,}/)) {
        if (!paragraph.includes('Windows')) continue;
        if (
          !paragraph.includes('Production Qualified') &&
          !paragraph.includes('production qualified')
        )
          continue;
        // A paragraph may contrast Linux and Windows, but any Windows status
        // claim must keep the Preview qualifier.
        expect(paragraph).toContain('Preview');
      }
    }
    expect(landing).toContain(
      '| Ubuntu 24.04 x86_64 / Linux | Production Qualified',
    );
    expect(landing).toContain('| Windows 11 x86_64 + WSL2    | Preview');
    expect(guide).toContain('WINDOWS_FRESH_HOST_QUALIFICATION = DEFERRED');
    expect(guide).not.toMatch(/WINDOWS_FRESH_HOST_QUALIFICATION = PASS/);
  });
});
