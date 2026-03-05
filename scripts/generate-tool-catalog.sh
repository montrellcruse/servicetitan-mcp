#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="${ROOT_DIR}/src/domains"
OUTPUT_FILE="${ROOT_DIR}/TOOLS.md"

if [[ ! -d "${SOURCE_DIR}" ]]; then
  echo "Source directory not found: ${SOURCE_DIR}" >&2
  exit 1
fi

tmp_entries="$(mktemp)"
tmp_sorted="$(mktemp)"

cleanup() {
  rm -f "${tmp_entries}" "${tmp_sorted}"
}

trap cleanup EXIT

rg -l 'registry\.register\(' "${SOURCE_DIR}" -g '*.ts' | sort | while IFS= read -r file; do
  awk '
    function extract_value(prefix, line, value) {
      value = line
      sub("^.*" prefix "[[:space:]]*\"", "", value)
      sub("\".*$", "", value)
      return value
    }

    /registry\.register\(\{/ {
      in_block = 1
      name = ""
      domain = ""
      operation = ""
      description = ""
      next
    }

    in_block {
      if (name == "" && $0 ~ /name:[[:space:]]*"/) {
        name = extract_value("name:", $0)
      }

      if (domain == "" && $0 ~ /domain:[[:space:]]*"/) {
        domain = extract_value("domain:", $0)
      }

      if (operation == "" && $0 ~ /operation:[[:space:]]*"/) {
        operation = extract_value("operation:", $0)
      }

      if (description == "") {
        if ($0 ~ /description:[[:space:]]*"/) {
          description = extract_value("description:", $0)
        } else if ($0 ~ /description:[[:space:]]*$/) {
          if (getline next_line > 0) {
            if (next_line ~ /[[:space:]]*"/) {
              description = next_line
              sub("^[[:space:]]*\"", "", description)
              sub("\".*$", "", description)
            }
          }
        }
      }

      if (name != "" && domain != "" && operation != "" && description != "") {
        print domain "\t" name "\t" operation "\t" description
        in_block = 0
      }
    }
  ' "${file}"
done > "${tmp_entries}"

sort -t $'\t' -k1,1 -k2,2 "${tmp_entries}" > "${tmp_sorted}"
total_tools="$(wc -l < "${tmp_sorted}" | tr -d '[:space:]')"

{
  echo "# Tool Catalog"
  echo
  echo "Total tools: ${total_tools}"
  echo

  if [[ "${total_tools}" -eq 0 ]]; then
    echo "_No tools found in src/domains._"
  else
    awk -F '\t' '
      BEGIN {
        current_domain = ""
      }
      {
        domain = $1
        name = $2
        operation = $3
        description = $4
        gsub(/\|/, "\\|", description)

        if (domain != current_domain) {
          if (current_domain != "") {
            print ""
          }
          print "## " domain
          print ""
          print "| Name | Domain | Operation | Description |"
          print "| --- | --- | --- | --- |"
          current_domain = domain
        }

        printf "| `%s` | `%s` | `%s` | %s |\n", name, domain, operation, description
      }
    ' "${tmp_sorted}"
  fi
} > "${OUTPUT_FILE}"

echo "Generated ${OUTPUT_FILE} with ${total_tools} tools."
