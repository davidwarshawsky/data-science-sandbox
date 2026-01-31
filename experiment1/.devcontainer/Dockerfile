FROM mcr.microsoft.com/devcontainers/python:3.10-bullseye

# Install basic utils (gpg for signing if needed inside, though we prefer host signing)
RUN apt-get update && apt-get install -y --no-install-recommends     gnupg2     && apt-get clean && rm -rf /var/lib/apt/lists/*

# Ensure workspace ownership
RUN chown -R vscode:vscode /workspace