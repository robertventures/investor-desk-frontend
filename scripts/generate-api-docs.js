#!/usr/bin/env node
/**
 * Generate AI-optimized API documentation from OpenAPI spec
 * 
 * Output: docs/API_REFERENCE.md - Single condensed reference (AI-optimized)
 */

const fs = require('fs');
const path = require('path');

const OPENAPI_PATH = path.join(__dirname, '..', 'docs', 'openapi.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'docs', 'API_REFERENCE.md');

function loadSpec() {
  return JSON.parse(fs.readFileSync(OPENAPI_PATH, 'utf8'));
}

function resolveRef(ref, spec) {
  if (!ref?.startsWith('#/')) return null;
  let current = spec;
  for (const part of ref.replace('#/', '').split('/')) {
    current = current?.[part];
  }
  return current;
}

// Get compact schema representation
function getCompactSchema(schema, spec, depth = 0) {
  if (!schema || depth > 2) return 'any';
  
  if (schema.$ref) {
    const name = schema.$ref.split('/').pop();
    const resolved = resolveRef(schema.$ref, spec);
    if (resolved?.properties && depth < 1) {
      return getCompactSchema(resolved, spec, depth);
    }
    return name;
  }
  
  if (schema.anyOf || schema.oneOf) {
    const opts = (schema.anyOf || schema.oneOf)
      .map(o => o.$ref ? o.$ref.split('/').pop() : getCompactSchema(o, spec, depth + 1))
      .filter(Boolean);
    return opts.join(' | ');
  }
  
  if (schema.type === 'array' && schema.items) {
    const itemType = getCompactSchema(schema.items, spec, depth + 1);
    return `${itemType}[]`;
  }
  
  if (schema.properties) {
    const props = [];
    const required = schema.required || [];
    for (const [name, prop] of Object.entries(schema.properties)) {
      let type = prop.type || 'any';
      if (prop.$ref) type = prop.$ref.split('/').pop();
      if (prop.type === 'array' && prop.items) {
        type = prop.items.$ref ? `${prop.items.$ref.split('/').pop()}[]` : `${prop.items.type || 'any'}[]`;
      }
      if (prop.enum) type = prop.enum.map(e => `"${e}"`).join('|');
      
      const req = required.includes(name) ? '*' : '?';
      const desc = prop.description ? ` // ${prop.description.slice(0, 40)}` : '';
      props.push(`${name}${req}: ${type}${desc}`);
    }
    return `{ ${props.join(', ')} }`;
  }
  
  if (schema.enum) {
    return schema.enum.map(e => `"${e}"`).join(' | ');
  }
  
  return schema.type || 'any';
}

// Extract all endpoints with compact info
function extractEndpoints(spec) {
  const endpoints = [];
  
  for (const [pathUrl, methods] of Object.entries(spec.paths || {})) {
    for (const [method, details] of Object.entries(methods)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      
      const tags = details.tags || ['other'];
      const summary = details.summary || '';
      
      // Query params (compact)
      const queryParams = (details.parameters || [])
        .filter(p => p.in === 'query')
        .map(p => {
          let type = p.schema?.type || 'string';
          if (p.schema?.enum) type = p.schema.enum.map(e => `"${e}"`).join('|');
          const req = p.required ? '*' : '?';
          return `${p.name}${req}: ${type}`;
        });
      
      // Request body (compact)
      let requestBody = null;
      if (details.requestBody?.content?.['application/json']?.schema) {
        const schema = details.requestBody.content['application/json'].schema;
        requestBody = getCompactSchema(schema, spec);
      }
      
      // Response (compact)
      let response = null;
      const successResp = details.responses?.['200'] || details.responses?.['201'];
      if (successResp?.content?.['application/json']?.schema) {
        response = getCompactSchema(successResp.content['application/json'].schema, spec);
      }
      
      endpoints.push({
        path: pathUrl,
        method: method.toUpperCase(),
        tag: tags[0] || 'other',
        summary,
        queryParams,
        requestBody,
        response
      });
    }
  }
  
  return endpoints;
}

// Generate condensed AI-optimized reference
function generateReference(spec, endpoints) {
  const lines = [];
  
  lines.push('# API Reference');
  lines.push('');
  lines.push('> Single-file API reference optimized for AI. Run `npm run update-api` to refresh.');
  lines.push('');
  lines.push('**Base URL**: `https://backend-9r5h.onrender.com`');
  lines.push('**Auth**: Bearer token in Authorization header');
  lines.push(`**Endpoints**: ${endpoints.length}`);
  lines.push('');
  lines.push('**Notation**: `*` = required, `?` = optional');
  lines.push('');
  lines.push('---');
  lines.push('');
  
  // Group by tag
  const byTag = {};
  for (const ep of endpoints) {
    if (!byTag[ep.tag]) byTag[ep.tag] = [];
    byTag[ep.tag].push(ep);
  }
  
  // Sort tags by importance (common ones first)
  const tagOrder = ['auth', 'profile', 'investments', 'payment-methods', 'plaid', 'withdrawals', 'activity', 'documents', 'admin', 'support', 'stats', 'health'];
  const sortedTags = Object.keys(byTag).sort((a, b) => {
    const aIdx = tagOrder.indexOf(a);
    const bIdx = tagOrder.indexOf(b);
    if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });
  
  for (const tag of sortedTags) {
    const eps = byTag[tag];
    lines.push(`## ${tag.toUpperCase()}`);
    lines.push('');
    
    for (const ep of eps) {
      lines.push(`### ${ep.method} ${ep.path}`);
      if (ep.summary) lines.push(`${ep.summary}`);
      lines.push('');
      
      if (ep.queryParams.length > 0) {
        lines.push(`**Query**: \`${ep.queryParams.join(', ')}\``);
      }
      
      if (ep.requestBody) {
        let body = ep.requestBody;
        if (body.length > 200) body = body.slice(0, 200) + '...}';
        lines.push(`**Body**: \`${body}\``);
      }
      
      if (ep.response) {
        let resp = ep.response;
        if (resp.length > 200) resp = resp.slice(0, 200) + '...}';
        lines.push(`**Response**: \`${resp}\``);
      }
      
      lines.push('');
    }
  }
  
  return lines.join('\n');
}

function main() {
  console.log('📚 Generating API reference...');
  
  const spec = loadSpec();
  const endpoints = extractEndpoints(spec);
  
  const content = generateReference(spec, endpoints);
  fs.writeFileSync(OUTPUT_PATH, content);
  
  const lines = content.split('\n').length;
  const tokens = Math.round(lines * 10);
  
  console.log(`✓ docs/API_REFERENCE.md`);
  console.log(`  ${endpoints.length} endpoints | ${lines} lines | ~${Math.round(tokens/1000)}K tokens`);
}

try {
  main();
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
