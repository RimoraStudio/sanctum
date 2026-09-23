# sanctum-standalone

![Version: 1.10.0](https://img.shields.io/badge/Version-1.10.0-informational?style=flat-square) ![Type: application](https://img.shields.io/badge/Type-application-informational?style=flat-square) ![AppVersion: 1.0.1](https://img.shields.io/badge/AppVersion-1.0.1-informational?style=flat-square)

A helm chart to deploy Sanctum

## Requirements

| Repository | Name | Version |
|------------|------|---------|
| https://charts.bitnami.com/bitnami | postgresql | 14.1.3 |
| https://charts.bitnami.com/bitnami | redis | 18.14.0 |
| https://kubernetes.github.io/ingress-nginx | ingress-nginx | 4.0.13 |

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| fullnameOverride | string | `""` | Overrides the full name of the release, affecting resource names |
| sanctum.affinity | object | `{}` | Node affinity settings for pod placement |
| sanctum.containerSecurityContext | object | `{"allowPrivilegeEscalation":false,"capabilities":{"drop":["ALL"]},"readOnlyRootFilesystem":false,"runAsNonRoot":true,"runAsUser":1001,"seccompProfile":{"type":"RuntimeDefault"}}` | Container-level security context for Sanctum's containers, including the bootstrap Job. Secure by default and compliant with the Pod Security "restricted" standard on its own. `readOnlyRootFilesystem` stays `false` because the app writes temporary files; to enable it, mount `emptyDir` volumes for writable paths like `/tmp` via `sanctum.extraVolumes` and `sanctum.extraVolumeMounts`. Set to `null` to omit. |
| sanctum.databaseSchemaMigrationJob.image.pullPolicy | string | `"IfNotPresent"` | Pulls image only if not present on the node |
| sanctum.databaseSchemaMigrationJob.image.repository | string | `"ghcr.io/groundnuty/k8s-wait-for"` | Image repository for migration wait job |
| sanctum.databaseSchemaMigrationJob.image.tag | string | `"no-root-v2.0"` | Image tag version |
| sanctum.deploymentAnnotations | object | `{}` | Custom annotations for Sanctum deployment |
| sanctum.enabled | bool | `true` |  |
| sanctum.extraContainers | list | `[]` | Additional containers to run alongside the Sanctum container (sidecars). Useful for running auxiliary services like HSM PKCS#11 clients |
| sanctum.extraEnv | list | `[]` | Extra environment variables to set on the Sanctum container |
| sanctum.extraInitContainers | list | `[]` | Additional init containers to run before the Sanctum container starts |
| sanctum.extraVolumeMounts | list | `[]` | Additional volume mounts for the Sanctum container |
| sanctum.extraVolumes | list | `[]` | Additional volumes to attach to the Sanctum pods |
| sanctum.fullnameOverride | string | `""` | Override for the full name of Sanctum resources in this deployment |
| sanctum.image.imagePullSecrets | list | `[]` | Secret references for pulling the image, if needed |
| sanctum.image.pullPolicy | string | `"IfNotPresent"` | Pulls image only if not already present on the node |
| sanctum.image.repository | string | `"sanctum/sanctum"` | Image repository for the Sanctum service |
| sanctum.image.tag | string | `"v0.93.1-postgres"` | Specific version tag of the Sanctum image. View the latest version here https://hub.docker.com/r/sanctum/sanctum |
| sanctum.kubeSecretRef | string | `"sanctum-secrets"` | Kubernetes Secret reference containing Sanctum root credentials |
| sanctum.name | string | `"sanctum"` |  |
| sanctum.podAnnotations | object | `{}` | Custom annotations for Sanctum pods |
| sanctum.podSecurityContext | object | `{"fsGroup":1001}` | Pod-level security context for the Sanctum pod. Sets only `fsGroup` so mounted volumes are writable by the non-root user. Other hardening lives in `containerSecurityContext`, so `extraContainers` and `extraInitContainers` keep their original user. Set to `null` to omit. |
| sanctum.replicaCount | int | `2` | Number of pod replicas for high availability |
| sanctum.resources.limits.memory | string | `"600Mi"` | Memory limit for Sanctum container |
| sanctum.resources.requests.cpu | string | `"350m"` | CPU request for Sanctum container |
| sanctum.service.annotations | object | `{}` | Custom annotations for Sanctum service |
| sanctum.service.nodePort | string | `""` | Optional node port for service when using NodePort type |
| sanctum.service.type | string | `"ClusterIP"` | Service type, can be changed based on exposure needs (e.g., LoadBalancer) |
| sanctum.serviceAccount.annotations | object | `{}` | Custom annotations for the auto-created service account |
| sanctum.serviceAccount.create | bool | `true` | Creates a new service account if true, with necessary permissions for this chart. If false and `serviceAccount.name` is not defined, the chart will attempt to use the Default service account |
| sanctum.serviceAccount.name | string | `nil` | Optional custom service account name, if existing service account is used |
| ingress.annotations | object | `{}` | Custom annotations for ingress resource |
| ingress.enabled | bool | `true` | Enable or disable ingress configuration |
| ingress.hostName | string | `""` | Hostname for ingress access, e.g., app.example.com |
| ingress.ingressClassName | string | `""` | Specifies the ingress class. Defaults to "sanctum-nginx" when bundled ingress-nginx is enabled, or "nginx" otherwise |
| ingress.nginx.enabled | bool | `true` | Enable NGINX-specific settings, if using NGINX ingress controller |
| ingress.tls | list | `[]` | TLS settings for HTTPS access |
| nameOverride | string | `""` | Overrides the default release name |
| postgresql.auth.database | string | `"sanctumDB"` | Database name for Sanctum |
| postgresql.auth.password | string | `"root"` | Password for PostgreSQL database access |
| postgresql.auth.username | string | `"sanctum"` | Database username for PostgreSQL |
| postgresql.enabled | bool | `true` | Enables an in-cluster PostgreSQL deployment. To achieve HA for Postgres, we recommend deploying https://github.com/zalando/postgres-operator instead. |
| postgresql.fullnameOverride | string | `"postgresql"` | Full name override for PostgreSQL resources |
| postgresql.name | string | `"postgresql"` | PostgreSQL resource name |
| postgresql.useExistingPostgresSecret.enabled | bool | `false` | Set to true if using an existing Kubernetes secret that contains PostgreSQL connection string |
| postgresql.useExistingPostgresSecret.existingConnectionStringSecret.key | string | `""` | Key name in the Kubernetes secret that holds the connection string |
| postgresql.useExistingPostgresSecret.existingConnectionStringSecret.name | string | `""` | Kubernetes secret name containing the PostgreSQL connection string |
| redis.architecture | string | `"standalone"` | Redis deployment type (e.g., standalone or cluster) |
| redis.auth.password | string | `"mysecretpassword"` | Redis password |
| redis.cluster.enabled | bool | `false` | Clustered Redis deployment |
| redis.enabled | bool | `true` | Enables an in-cluster Redis deployment |
| redis.fullnameOverride | string | `"redis"` | Full name override for Redis resources |
| redis.name | string | `"redis"` | Redis resource name |
| redis.usePassword | bool | `true` | Requires a password for Redis authentication |
| ingress-nginx.controller.ingressClassResource.name | string | `"sanctum-nginx"` | IngressClass name used by the bundled NGINX controller. Uses a unique name to avoid conflicts with existing cluster ingress controllers |
| ingress-nginx.controller.ingressClassResource.controllerValue | string | `"k8s.io/sanctum-nginx"` | Controller value for the bundled IngressClass |
| ingress-nginx.controller.ingressClassResource.default | bool | `false` | Whether the bundled IngressClass should be set as the cluster default |
| ingress-nginx.controller.ingressClass | string | `"sanctum-nginx"` | Ingress class the bundled controller watches for |
