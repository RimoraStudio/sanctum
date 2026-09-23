{{/*
Expand the name of the chart.
*/}}
{{- define "sanctum.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "sanctum.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create unified labels for sanctum components
*/}}
{{- define "sanctum.common.matchLabels" -}}
app: {{ template "sanctum.name" . }}
release: {{ .Release.Name }}
{{- end -}}

{{- define "sanctum.common.metaLabels" -}}
chart: {{ template "sanctum.chart" . }}
heritage: {{ .Release.Service }}
{{- end -}}

{{- define "sanctum.common.labels" -}}
{{ include "sanctum.common.matchLabels" . }}
{{ include "sanctum.common.metaLabels" . }}
{{- end -}}

{{- define "sanctum.labels" -}}
{{ include "sanctum.matchLabels" . }}
{{ include "sanctum.common.metaLabels" . }}
{{- end -}}

{{- define "sanctum.matchLabels" -}}
component: {{ .Values.sanctum.name | quote }}
{{ include "sanctum.common.matchLabels" . }}
{{- end -}}

{{- define "sanctum.roleName" -}}
{{- printf "%s-sanctum" .Release.Name -}}
{{- end -}}

{{- define "sanctum.roleBindingName" -}}
{{- printf "%s-sanctum" .Release.Name -}}
{{- end -}}

{{- define "sanctum.serviceAccountName" -}}
{{- if .Values.sanctum.serviceAccount.create -}}
{{- printf "%s-sanctum" .Release.Name -}}
{{- else -}}
{{- .Values.sanctum.serviceAccount.name | default "default" -}}
{{- end -}}
{{- end -}}


{{/*
Create a fully qualified backend name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "sanctum.fullname" -}}
{{- if .Values.sanctum.fullnameOverride -}}
{{- .Values.sanctum.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- printf "%s-%s" .Release.Name .Values.sanctum.name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s-%s" .Release.Name $name .Values.sanctum.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "sanctum.postgresService" -}}
{{- if .Values.postgresql.fullnameOverride -}}
{{- .Values.postgresql.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-postgresql" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "sanctum.postgresDBConnectionString" -}}
{{- $dbUsername := .Values.postgresql.auth.username -}}
{{- $dbPassword := .Values.postgresql.auth.password -}}
{{- $dbName := .Values.postgresql.auth.database -}}
{{- $serviceName := include "sanctum.postgresService" . -}}
{{- printf "postgresql://%s:%s@%s:5432/%s" $dbUsername $dbPassword $serviceName $dbName -}}
{{- end -}}

{{/*
Create a fully qualified redis name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "sanctum.redis.fullname" -}}
{{- if .Values.redis.fullnameOverride -}}
{{- .Values.redis.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- printf "%s-%s" .Release.Name .Values.redis.name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s-%s" .Release.Name $name .Values.redis.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}


{{- define "sanctum.redisServiceName" -}}
{{- if .Values.redis.fullnameOverride -}}
{{- printf "%s-master" .Values.redis.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-master" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}


{{- define "sanctum.redisConnectionString" -}}
{{- $password := .Values.redis.auth.password -}}
{{- $serviceName := include "sanctum.redisServiceName" . -}}
{{- printf "redis://default:%s@%s:6379" $password "redis-master" -}}
{{- end -}}