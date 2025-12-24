# SnipForge Command Bundles

Complete collection of command snippets for developers, sysadmins, DevOps engineers, and support staff.

**Special Focus**: Enhanced n8n support bundles for troubleshooting self-hosted and cloud deployments.

## 📦 Bundles Included (25 total, 439 commands)

### Development Tools
1. **01-git-github.json** (15 commands)
   - Git basics, branching, stashing, history, force push

2. **02-docker.json** (18 commands)
   - Container management, images, Docker Compose, cleanup

3. **03-nodejs-npm.json** (16 commands)
   - NPM, Yarn, PNPM package management, scripts

### System Administration
4. **04-ssh.json** (14 commands)
   - SSH connections, keys, tunneling, SCP, SFTP

5. **05-linux-basics.json** (20 commands)
   - File operations, navigation, viewing, disk usage

6. **06-file-operations.json** (15 commands)
   - Permissions, find, links, file types

7. **07-process-management.json** (16 commands)
   - Process control, jobs, nice, renice, monitoring

### DevOps & Infrastructure
8. **08-kubernetes.json** (18 commands)
   - Pods, deployments, logs, exec, port-forward

9. **16-cicd.json** (12 commands)
   - GitHub Actions and GitLab CI pipelines

10. **18-monitoring.json** (12 commands)
    - Systemd, Docker stats, memory, I/O monitoring

### Databases
11. **09-postgresql.json** (14 commands)
    - Connection, dumps, restore, maintenance

12. **10-mysql-sqlite-redis.json** (16 commands)
    - MySQL, SQLite operations, Redis connection

### Web Development
13. **11-html-templates.json** (10 commands)
    - HTML5 templates, forms, meta tags, components

14. **12-curl-api-testing.json** (15 commands)
    - REST API testing, authentication, downloads

15. **17-nginx.json** (12 commands)
    - Server blocks, reverse proxy, SSL, load balancing

16. **20-ssl-certificates.json** (12 commands)
    - Certbot, Let's Encrypt, OpenSSL, certificate management

### Utilities
17. **13-text-processing.json** (18 commands)
    - grep, sed, awk, jq for text manipulation

18. **14-archive-compression.json** (14 commands)
    - tar, zip, gzip, 7z operations

19. **15-network-diagnostics.json** (16 commands)
    - ping, traceroute, netstat, nmap, DNS

### Automation & n8n Support
20. **19-n8n.json** (18 commands)
    - Basic n8n CLI for workflows, exports, user management

21. **21-n8n-cli-commands.json** (25 commands) ⭐ NEW
    - Comprehensive n8n CLI commands with Docker integration
    - Workflow/credential export and import with all flags
    - Backup strategies, activation/deactivation, security audits

22. **22-n8n-troubleshooting.json** (35 commands) ⭐ NEW
    - Health checks, webhook testing (GET/POST/headers)
    - OAuth2 endpoint testing and debugging
    - Log analysis, environment variable checks
    - Database and Redis connection testing
    - Performance monitoring and diagnostics

23. **23-n8n-api-testing.json** (30 commands) ⭐ NEW
    - Complete REST API commands for workflows, executions, credentials
    - Authentication testing, pagination, filtering
    - API-based workflow management and monitoring
    - Advanced jq queries for data extraction

24. **24-n8n-docker-kubernetes.json** (40 commands) ⭐ NEW
    - Production docker-compose templates (PostgreSQL, queue mode)
    - Container management, logs, updates, backups
    - Helm chart installation and configuration
    - Kubernetes pod management, scaling, monitoring
    - Worker scaling for queue mode

### JavaScript Utilities
25. **25-javascript-utilities.json** (30 commands) ⭐ NEW
    - Email validation and comparison
    - JSON parsing, validation, and manipulation
    - Date/time calculations and formatting
    - Array operations (filter, group, chunk, sort)
    - Object manipulation (merge, extract, clone)
    - String utilities (slugify, truncate, Base64)
    - Common support engineering helpers

## 🚀 How to Import

1. Open SnipForge
2. Click Settings → Import
3. Select one or more bundle files
4. Commands will be imported with all tags and metadata

## 📝 Command Format

Each command includes:
- **title**: Clear description
- **body**: Command with `{{variables}}` for customization
- **description**: What the command does
- **tags**: For easy filtering and search
- **language**: Syntax highlighting (bash, sql, yaml, html, etc.)
- **created_at/updated_at**: Timestamps

## 💡 Usage Tips

- Use `{{variable name}}` syntax - you'll be prompted for values when copying
- Tags help filter commands by technology (e.g., "docker", "git")
- Each bundle is self-contained - import only what you need
- Commands are ordered from basic to advanced within each bundle

## 🔧 Technologies Covered

**Languages & Runtimes**: Node.js, Python, JavaScript
**Version Control**: Git, GitHub
**Containers**: Docker, Docker Compose, Kubernetes, Helm
**Databases**: PostgreSQL, MySQL, SQLite, Redis
**Web Servers**: Nginx
**CI/CD**: GitHub Actions, GitLab CI
**Security**: SSL/TLS, OpenSSL, Certbot
**Automation**: n8n (extensive coverage with 5 specialized bundles)
**Monitoring**: systemd, Docker, Linux tools, Prometheus
**Networking**: SSH, DNS, diagnostics
**Text Processing**: grep, sed, awk, jq
**APIs**: REST API testing with curl, webhook testing, OAuth2

## 🎯 n8n Support Engineer Toolkit

The command bundles now include **extensive n8n support resources** based on:
- Official n8n documentation and community forums
- Common troubleshooting scenarios from production deployments
- Real-world issues from self-hosted and cloud environments
- Best practices for Docker and Kubernetes deployments

**Perfect for**:
- n8n support team members
- DevOps engineers managing n8n infrastructure
- Developers troubleshooting workflow issues
- System administrators handling n8n deployments  

## 📄 License

These command snippets are provided as-is for use with SnipForge.

---

**Total Commands**: 439 across 25 bundles
**Created**: December 2025
**Last Updated**: December 2025 (v2.6.1 - Added n8n support bundles)
**Format Version**: 2.6.1

## 📚 Documentation Sources

All n8n commands include inline references to official documentation:
- docs.n8n.io - Official n8n documentation
- community.n8n.io - n8n community forum
- github.com/n8n-io/n8n - Official n8n repository
- community-charts.github.io - Kubernetes Helm charts

Commands are researched and verified from:
- Official documentation and API references
- Community troubleshooting threads
- Production deployment best practices
- Common support scenarios and solutions
