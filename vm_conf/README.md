# VM set up instructions

- Create > Instance
- "By Image" tab
- "Featured-Minimal-Ubuntu22", "Create Instance" button

- **Name:** _name_
- **Image:** Featured-Minimal-Ubuntu22
- **Flavor:** g3.small
- **Choose a root disk size:** Custom disk size (volume-backed)
  - **Root disk size (GB):** 20
- **How many Instances?** 1
- **Enable web desktop?** No
- **Choose an SSH public key:** _Select *None* or your own key_
- **Advanced Options:** Show
- **Install operating system updates?** Yes
- **Deploy Guacamole for easy remote access?** No
- **Network:** _Use default value_
- **Public IP Address:** Automatic
- **Boot Script**

  - Append `, docker` to the line `groups: sudo, admin` near the end of the script

- use Ubuntu 22.04 (for consistency with the other vms)
- way to get the full external hostname automatically?
- `g3.small`, disable as much as possible

- `docker login ghcr.io --username <USERNAME> --password-stdin`
- paste token created with `read:packages` scope, `Ctrl`+`D`

based on [Ubuntu - Firewalls - Jetstream2 Documentation](https://docs.jetstream-cloud.org/general/firewalls/#ubuntu)

```bash
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 433
sudo ufw allow 8433
sudo ufw enable
```

following both for initial start and for updating

```bash
wget --output-document Caddyfile https://raw.githubusercontent.com/ALLAN-DIP/diplomacy/refs/heads/main/vm_conf/Caddyfile
wget --output-document compose.yaml https://raw.githubusercontent.com/ALLAN-DIP/diplomacy/refs/heads/main/vm_conf/compose.yaml

HOSTNAME=$(hostname).cis240208.projects.jetstream-cloud.org
export HOSTNAME

# Start server, stopping first if running
docker compose down
docker compose up --detach
```
