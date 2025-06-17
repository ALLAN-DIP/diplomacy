# Production environment

There is a VM running on Jetstream2 that is set up as a production environment.

## Deployment

This section focuses only on deploying the application and assumes the environment is already set up.

Use the following steps both for initially deploying and later redeploying the application:

- Set up the VM according to the "[VM configuration](#vm-configuration)" section below.
- Stop the server with the following command:
  ```bash
  docker compose down
  ```
- Download the latest versions of the required files with the following commands:
  ```bash
  wget --output-document Caddyfile https://raw.githubusercontent.com/ALLAN-DIP/diplomacy/refs/heads/main/vm_conf/Caddyfile
  wget --output-document compose.yaml https://raw.githubusercontent.com/ALLAN-DIP/diplomacy/refs/heads/main/vm_conf/compose.yaml
  ```
- Start the server with the following command:
  ```bash
  docker compose up --detach
  ```

## VM configuration

There are many tasks needed to properly configure the VM. The following sections are in the order that you should complete them.

### Creating a new VM

A new virtual machine can be created on Jetstream2 by filling out the form linked from [Exosphere](https://jetstream2.exosphere.app/exosphere/home). Use the following steps to navigate to the creation form:

- Click the pane of the allocation to create the new VM in
- Select **Create > Instance**
- Select the **By Image** tab
- Click the **Create Instance** button for **Featured-Minimal-Ubuntu22**
  - We are using Ubuntu 22.04 for consistency with the other VMs

The desired values for the form are listed below. Values in italics should be substituted with more appropriate values. If a field is missing, it is either new or has a value that will vary across requests.

> - **Name:** _name_
> - **Image:** Featured-Minimal-Ubuntu22
> - **Flavor:** g3.small
> - **Choose a root disk size:** Custom disk size (volume-backed)
>   - **Root disk size (GB):** 20
> - **How many Instances?** 1
> - **Enable web desktop?** No
> - **Choose an SSH public key:** _Select **None** or your own key_
> - **Advanced Options:** Show
> - **Install operating system updates?** Yes
> - **Deploy Guacamole for easy remote access?** No
> - **Network:** _Use default value_
> - **Public IP Address:** Automatic
> - **Boot Script**
>   - Append `, docker` to the line `groups: sudo, admin` near the end of the script

This creates a VM as small and minimal as possible and simplifies the setup steps that follow.

### Set up firewall

Set up the firewall by running the following commands:

```bash
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 433
sudo ufw allow 8433
sudo ufw enable
```

These commands were based on the ones provided at [Ubuntu - Firewalls - Jetstream2 Documentation](https://docs.jetstream-cloud.org/general/firewalls/#ubuntu).

### Log into GitHub Container Registry

The [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) (GHCR) provides free hosting of OCI images but requires authentication using a GitHub account. Use the following instructions to log into GHCR:

- Follow the instructions at [Creating a personal access token (classic) - Managing your personal access tokens - GitHub Docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-personal-access-token-classic) to create a personal access token (classic)
  - Give the token only the `read:packages` scope
  - Save the token somewhere secure because there is no way to view it again
- Run the following command to start the process of logging into GHCR, replacing `<USERNAME>` with your GitHub username:
  ```bash
  docker login ghcr.io --username <USERNAME> --password-stdin
  ```
- Paste token into the terminal
- Press `Control`+`D` to submit the token

The command should output a success message if the login process succeeded.

### Declare domain name

We shouldn't hardcode the instance's domain name in configuration files because:

- The configuration files should work on multiple machines
- We shouldn't have the domain name publicly available

Therefore, we should have it automatically generated on the VM itself.

To do that, run the following commands:

```bash
# Ensure that `DOMAIN_NAME` is initialized on login
cat <<-EOF >>~/.bashrc

# Declare domain name for Docker Compose
DOMAIN_NAME=$(hostname).cis240208.projects.jetstream-cloud.org
export DOMAIN_NAME
EOF

# Reload file to initialize variable now
source ~/.bashrc
```
