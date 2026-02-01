# Installation Guide

## 1. Overview

You need **Node.js** and **Git**. 


Or, to be exact:
- **Node.js 18 LTS or newer** (which includes `npm`). Quantickle is tested with
  the current Long-Term Support release line. Older runtimes may miss required
  Web API features.
- **Git 2.30 or newer** for cloning and updating the repository.
- **A modern web browser** such as Chrome, Edge, or Firefox for running the UI.

This is a browser-based application. Quantickle ships as a Node.js + Express application that serves the static
front-end and JSON APIs from the same process. The instructions below cover the
supported desktop platforms and walk you through installing the prerequisites,
cloning the repository, and running the development server.


## 2. By platform

### Windows 10/11

Download the Node.js LTS installer from <https://nodejs.org/en/download> and follow the wizard.

Similar for Git: <https://git-scm.com/install/windows>

Or, if you want to script it up:

1. Open **Windows Terminal** or **PowerShell** as an administrator.
2. Install Node.js LTS through the Windows Package Manager:
   ```powershell
   winget install --id OpenJS.NodeJS.LTS -e
   ```
3. Install Git:
   ```powershell
   winget install --id Git.Git -e
   ```
4. Close and reopen the terminal so the new PATH entries are applied.
5. Verify the tools:
   ```powershell
   node -v
   npm -v
   git --version
   ```
   The commands should report versions (e.g., `v18.20.3`).

> Optional: Developers who prefer version managers can install
> [nvm-windows](https://github.com/coreybutler/nvm-windows) and run `nvm install
> 18` followed by `nvm use 18`.

### macOS (Intel & Apple Silicon)

1. Install [Homebrew](https://brew.sh/) if it is not already present.
2. Use Homebrew to install Node.js LTS and Git:
   ```bash
   brew install node@20 git
   ```
   Homebrew symlinks the binaries to `/usr/local/bin` (Intel) or
   `/opt/homebrew/bin` (Apple Silicon).
3. Confirm the versions:
   ```bash
   node -v
   npm -v
   git --version
   ```
4. If you prefer not to use Homebrew, download the macOS `.pkg` installers from
   <https://nodejs.org/> and <https://git-scm.com/download/mac>.

### Linux

#### Debian / Ubuntu / Linux Mint

1. Update the package lists and install Node.js LTS from NodeSource along with
   Git:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
   sudo apt-get install -y nodejs git
   ```
2. Verify the versions:
   ```bash
   node -v
   npm -v
   git --version
   ```

#### Fedora / Rocky / AlmaLinux / RHEL

1. Enable the NodeSource repository and install the packages:
   ```bash
   curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
   sudo dnf install -y nodejs git
   ```
2. Confirm the installation with the same `node`, `npm`, and `git` checks.

#### Arch Linux / Manjaro

1. Install Node.js LTS and Git via `pacman`:
   ```bash
   sudo pacman -S --needed nodejs-lts-hydrogen npm git
   ```
2. Verify the tooling as above.

> 💡 On servers or headless setups, ensure that port **3000** is open in your
> firewall so the browser can reach the development server.


> ℹ️ **Package managers**: The commands below rely on the platform-native
> package managers (`winget`, `brew`, `apt`, `dnf`). If you prefer installers or
> alternative managers (e.g., `nvm`, `asdf`), feel free to substitute them while
> ensuring Node.js 18+ is available on your PATH.



## 3. Clone and set up Quantickle

The remaining steps are identical on every platform. Run the commands in a
terminal (PowerShell on Windows, Terminal on macOS, or your shell of choice on
Linux).

1. Clone the repository and change into it:
   ```bash
   git clone https://github.com/RSAC-Advanced-Concepts/quantickle.git
   cd quantickle
   ```
2. Install the Node.js dependencies:
   ```bash
   npm install
   ```
   This command installs both runtime (`dependencies`) and development
   (`devDependencies`) packages listed in `package.json`.
3. Copy the environment template and configure it:
   - macOS/Linux:
     ```bash
     cp .env.example .env
     ```
   - Windows (PowerShell):
     ```powershell
     Copy-Item .env.example .env
     ```
   Open `.env` and set any values you need. Common options include:
   - `PORT` — server port (defaults to 3000)
   - `PROXY_ALLOWLIST` — comma-separated hosts for `/api/proxy`
   - `CORS_ORIGINS` — comma-separated allowed origins. Default port should probably match the server port above
   - `SERPAPI_API_KEY` — key for the SerpApi integration
   - `NEO4J_URL`, `NEO4J_USER`, `NEO4J_PASSWORD` — Neo4j credentials
4. Review the default proxy allowlist at `config/proxy-allowlist.json`. If you
   need to contact additional domains through the `/api/proxy` endpoint, add
   them to the `allowlist` array. You can also override the list at runtime by
   setting the `PROXY_ALLOWLIST` environment variable to a comma-separated list
   of hostnames.
5. Start the server:
   ```bash
   npm start
   ```
   The Express server listens on port `3000` by default. Set the `PORT`
   environment variable before running `npm start` to use a custom port
   (e.g., `PORT=8080 npm start`). Remember to also sync the CORS port(s).
6. Open <http://localhost:3000> in your browser. The main Quantickle interface
   should load with the bundled examples available under **File → Open Example**.

## 4. Developer workflow tips

- For automatic reloads during development, install `nodemon` globally
  (`npm install -g nodemon`) or use the bundled script:
  ```bash
  npm run dev
  ```
  This watches `server.js` for changes and restarts the server automatically.
- To expose the app to other devices on your network, export the `HOST`
  variable before starting the server (e.g., `HOST=0.0.0.0 npm start`) and make
  sure your firewall allows inbound connections on the chosen port.
- If you rely on the SerpApi integration, export `SERPAPI_API_KEY` in your
  shell so that `/api/serpapi` requests succeed.

## 5. Optional integrations

- **Neo4j graph store** – Follow the dedicated
  [Neo4j integration guide](NEO4J_INTEGRATION_README.md) to install Neo4j and
  configure credentials via environment variables or HTTP headers.
- **SerpApi key** – needed for the Google Search proxy; provide it via the
  `SERPAPI_API_KEY` environment variable when starting the server.

## 6. Troubleshooting

- `npm install` fails with certificate or proxy errors – configure the `npm`
  proxy settings (`npm config set proxy http://user:pass@proxy:port`) or install
  certificates required by your organisation.
- `npm start` reports "Proxy allowlist configuration is missing" – ensure
  `config/proxy-allowlist.json` exists (the repository includes an example) or
  set `PROXY_ALLOWLIST="*"` for unrestricted access during local development.
- Port 3000 is already in use – stop the conflicting service or run Quantickle
  on another port using `PORT=4000 npm start`.
- Browser cannot load assets due to CORS – extend the list of allowed origins by
  setting `CORS_ORIGINS` to a comma-separated list before starting the server.

Once the server starts without errors, you're ready to explore Quantickle. Check
out [`USAGE_GUIDE.md`](USAGE_GUIDE.md) for in-app workflows and advanced
features.
