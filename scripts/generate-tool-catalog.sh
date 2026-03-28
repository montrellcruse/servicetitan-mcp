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

# Strategy: find ALL registry.register() calls, including those inside helper functions.
# We look for the 4-field pattern: name, domain, operation, description.
# Handles both direct registry.register({...}) and indirect patterns where helpers
# build the registration object.
rg -l 'registry\.register\(' "${SOURCE_DIR}" -g '*.ts' | sort | while IFS= read -r file; do
  awk '
    function extract_value(prefix, line, value) {
      value = line
      sub("^.*" prefix "[[:space:]]*\"", "", value)
      sub("\".*$", "", value)
      return value
    }

    # Match any line that starts a register block — either direct or via helper variable
    /registry\.register\(\{/ || /registry\.register\(options\)/ || /registry\.register\(\{$/ {
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
      if (name == "" && $0 ~ /name:.*options\.name/) {
        # Helper pattern — skip this register call, entries come from call sites
        in_block = 0
        next
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

      # Bail out after 30 lines if we cannot find all fields
      if (in_block && ++block_lines > 30) {
        in_block = 0
        block_lines = 0
      }
    }

    # Also catch helper-function call-site patterns like:
    #   registerExportTool(registry, client, "export_invoices", "Export invoices", "/path")
    /registerExportTool\(/ {
      line = $0
      n = split(line, parts, "\"")
      if (n >= 4) {
        tool_name = parts[2]
        tool_desc = parts[4]
        print "export\t" tool_name "\tread\t" tool_desc
      }
    }

    # Catch registerAttributionCreateTool call sites
    /name:.*"marketing_/ && /description:/ {
      line = $0
      # This is inside an options object — handled by the main block parser
    }
  ' "${file}"
done > "${tmp_entries}"

# Add tools registered via helper functions that the awk scraper cannot detect.
# These are registered by helper functions that build the registration object dynamically.

# System health check (registered in index.ts, sse.ts, streamable-http.ts)
echo "system	st_health_check	read	Check ServiceTitan API connectivity and server status" >> "${tmp_entries}"

# Marketing helper-registered tools (registerAttributionCreateTool pattern)
echo "marketing	marketing_external_call_attributions_create	write	Create external call attributions" >> "${tmp_entries}"
echo "marketing	marketing_scheduled_job_attributions_create	write	Create scheduled job attributions" >> "${tmp_entries}"
echo "marketing	marketing_web_booking_attributions_create	write	Create web booking attributions" >> "${tmp_entries}"
echo "marketing	marketing_web_lead_form_attributions_create	write	Create web lead form attributions" >> "${tmp_entries}"

# Marketing opt-in/out and suppression tools (registered via inline helper patterns)
echo "marketing	marketing_opt_in_outs_list	read	List opt-in/out records" >> "${tmp_entries}"
echo "marketing	marketing_opt_in_outs_create	write	Create opt-in/out record" >> "${tmp_entries}"
echo "marketing	marketing_opt_in_outs_lookup_create	write	Lookup and create opt-in/out" >> "${tmp_entries}"
echo "marketing	marketing_suppressions_list	read	List marketing suppressions" >> "${tmp_entries}"
echo "marketing	marketing_campaign_costs_list	read	List campaign costs" >> "${tmp_entries}"

sort -t $'\t' -k1,1 -k2,2 "${tmp_entries}" | uniq > "${tmp_sorted}"
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
