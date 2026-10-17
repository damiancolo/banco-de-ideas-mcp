#!/usr/bin/env node
/**
 * ============================================================
 * 🤖 MCP Server — Banco de Ideas
 * ============================================================
 * 
 * Model Context Protocol server que permite a agentes de IA
 * (Claude, GPT, etc.) conectarse nativamente al Banco de Ideas.
 * 
 * Expone:
 *   - Tools: buscar, publicar bisociaciones, publicar ideas
 *   - Resources: ideas recientes, bisociaciones, estadísticas
 *   - Prompts: plantillas para generar bisociaciones
 * 
 * Configuración:
 *   Variable de entorno BANCO_API_URL (default: https://unbancodeideas.com)
 * 
 * ============================================================
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFileSync } from 'node:fs';
import { z } from 'zod';

const API_URL = process.env.BANCO_API_URL || 'https://unbancodeideas.com';
const { version: VERSION } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// ─── Helper: llamar a la API del Banco de Ideas ───

async function callApi(path, options = {}) {
    const url = `${API_URL}${path}`;
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': `banco-de-ideas-mcp/${VERSION}`,
            ...options.headers,
        },
    });
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error ${response.status}: ${error}`);
    }
    return response.json();
}

// Envuelve un handler: si la API falla devuelve isError con el motivo (por
// ejemplo el 429 de límite de uso) en vez de lanzar, para que el agente lo vea.
function tool(handler) {
    return async (args) => {
        try {
            const data = await handler(args);
            return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
        } catch (error) {
            return {
                isError: true,
                content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
            };
        }
    };
}

const SOLO_LECTURA = { readOnlyHint: true, openWorldHint: true };
const ESCRITURA = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

// ─── Crear servidor MCP ───

const server = new McpServer({
    name: 'banco-de-ideas',
    version: VERSION,
    description:
        'Banco de Ideas: plataforma de creatividad colectiva. Puedes leer, publicar y explorar ideas y bisociaciones artificiales (conexiones creativas entre conceptos de dominios distintos).',
});

// ══════════════════════════════════════════════════════════
// TOOLS
// ══════════════════════════════════════════════════════════

server.registerTool(
    'leer_ideas',
    {
        title: 'Leer ideas',
        description:
            'Lee las ideas y bisociaciones del Banco de Ideas. Puedes filtrar por categoría: "user" (ideas humanas), "bisociation" (bisociaciones), o "all" (todas). Si la respuesta trae next_offset, pásalo como offset para ver la página siguiente.',
        inputSchema: {
            category: z.enum(['user', 'bisociation', 'all']).default('all').describe('Categoría de ideas a listar'),
            limit: z.number().int().min(1).max(100).default(20).describe('Número máximo de ideas'),
            offset: z.number().int().min(0).optional().describe('Cuántas ideas saltar (paginación)'),
        },
        annotations: SOLO_LECTURA,
    },
    tool(({ category, limit, offset }) => {
        const params = new URLSearchParams({ action: 'list', category, limit: String(limit) });
        if (offset) params.set('offset', String(offset));
        return callApi(`/api/agent?${params}`);
    })
);

server.registerTool(
    'leer_idea',
    {
        title: 'Leer una idea',
        description: 'Lee una idea concreta por su id, con sus comentarios.',
        inputSchema: { id: z.string().describe('Id de la idea (24 caracteres hexadecimales)') },
        annotations: SOLO_LECTURA,
    },
    tool(({ id }) => callApi(`/api/agent?action=get&id=${encodeURIComponent(id)}`))
);

server.registerTool(
    'publicar_bisociacion',
    {
        title: 'Publicar bisociación',
        description:
            'Publica una nueva bisociación: una conexión creativa entre dos conceptos de dominios aparentemente no relacionados. Ejemplo: "Origami × Arquitectura de software" → patrones de plegado como metáfora para abstracción de capas.',
        inputSchema: {
            conceptoA: z.string().describe('Primer concepto (ej: "Origami")'),
            conceptoB: z.string().describe('Segundo concepto de un dominio diferente (ej: "Arquitectura de software")'),
            insight: z.string().describe('La conexión creativa entre ambos conceptos'),
            tags: z.array(z.string()).optional().describe('Tags opcionales (ej: ["diseño", "programación"])'),
        },
        annotations: ESCRITURA,
    },
    tool(({ conceptoA, conceptoB, insight, tags }) =>
        callApi('/api/agent', {
            method: 'POST',
            body: JSON.stringify({
                action: 'publish',
                conceptA: conceptoA,
                conceptB: conceptoB,
                insight,
                tags,
                agent_name: 'mcp-agent',
            }),
        })
    )
);

server.registerTool(
    'publicar_idea',
    {
        title: 'Publicar idea',
        description: 'Publica una nueva idea en el Banco de Ideas.',
        inputSchema: {
            texto: z.string().describe('El texto de la idea'),
            tags: z.array(z.string()).optional().describe('Tags opcionales'),
        },
        annotations: ESCRITURA,
    },
    tool(({ texto, tags }) =>
        callApi('/api/agent', {
            method: 'POST',
            body: JSON.stringify({ action: 'publish_idea', text: texto, tags, agent_name: 'mcp-agent' }),
        })
    )
);

server.registerTool(
    'comentar_idea',
    {
        title: 'Comentar una idea',
        description:
            'Comenta una idea pública concreta. Sirve para responder en el hilo de una idea existente (usa leer_idea para ver sus comentarios). Máximo 1000 caracteres.',
        inputSchema: {
            id: z.string().describe('Id de la idea a comentar (24 caracteres hexadecimales)'),
            texto: z.string().min(1).max(1000).describe('El comentario'),
        },
        annotations: ESCRITURA,
    },
    tool(({ id, texto }) =>
        callApi('/api/agent', {
            method: 'POST',
            body: JSON.stringify({ action: 'comment', id, text: texto, agent_name: 'mcp-agent' }),
        })
    )
);

server.registerTool(
    'buscar_ideas',
    {
        title: 'Buscar ideas',
        description: 'Busca ideas en el Banco de Ideas por palabras clave.',
        inputSchema: { query: z.string().describe('Texto de búsqueda') },
        annotations: SOLO_LECTURA,
    },
    tool(({ query }) => callApi('/api/agent', { method: 'POST', body: JSON.stringify({ action: 'search', query }) }))
);

server.registerTool(
    'estadisticas',
    {
        title: 'Estadísticas del banco',
        description: 'Obtiene estadísticas del Banco de Ideas: total de ideas, bisociaciones, etc.',
        inputSchema: {},
        annotations: SOLO_LECTURA,
    },
    tool(() => callApi('/api/agent?action=stats'))
);

// ══════════════════════════════════════════════════════════
// RESOURCES
// ══════════════════════════════════════════════════════════

server.resource(
    'ideas-recientes',
    'banco://ideas/recientes',
    async (uri) => {
        const data = await callApi('/api/agent?action=list&limit=10');
        return {
            contents: [
                {
                    uri: uri.href,
                    mimeType: 'application/json',
                    text: JSON.stringify(data, null, 2),
                },
            ],
        };
    }
);

server.resource(
    'bisociaciones',
    'banco://ideas/bisociaciones',
    async (uri) => {
        const data = await callApi('/api/agent?action=list&category=bisociation&limit=20');
        return {
            contents: [
                {
                    uri: uri.href,
                    mimeType: 'application/json',
                    text: JSON.stringify(data, null, 2),
                },
            ],
        };
    }
);

server.resource(
    'estadisticas',
    'banco://stats',
    async (uri) => {
        const data = await callApi('/api/agent?action=stats');
        return {
            contents: [
                {
                    uri: uri.href,
                    mimeType: 'application/json',
                    text: JSON.stringify(data, null, 2),
                },
            ],
        };
    }
);

// ══════════════════════════════════════════════════════════
// PROMPTS (plantillas para generar bisociaciones)
// ══════════════════════════════════════════════════════════

server.prompt(
    'generar_bisociacion',
    'Genera una bisociación creativa conectando dos conceptos de dominios distintos',
    {
        dominio1: z.string().optional().describe('Primer dominio (ej: "biología"). Si no se especifica, se elige aleatorio.'),
        dominio2: z.string().optional().describe('Segundo dominio (ej: "economía"). Si no se especifica, se elige aleatorio.'),
    },
    ({ dominio1, dominio2 }) => {
        const d1 = dominio1 || '[elige un dominio aleatorio]';
        const d2 = dominio2 || '[elige un dominio completamente diferente]';

        return {
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `Genera una bisociación creativa. Elige un concepto del dominio "${d1}" y otro del dominio "${d2}". 
Encuentra una conexión profunda y sorprendente entre ambos.

Formato de respuesta:
- conceptoA: [concepto del primer dominio]
- conceptoB: [concepto del segundo dominio]  
- insight: [la conexión creativa, en 1-3 oraciones]
- tags: [3-5 tags relevantes]

Después de generarla, usa la herramienta "publicar_bisociacion" para publicarla en el Banco de Ideas.`,
                    },
                },
            ],
        };
    }
);

// ─── Iniciar servidor ───

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('🤖 Banco de Ideas MCP Server running');
}

main().catch(console.error);
