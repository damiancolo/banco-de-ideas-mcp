# Cómo publicar en npm y en el registro oficial de MCP

Pasos para que el servidor aparezca en el [registro oficial de MCP](https://registry.modelcontextprotocol.io) (y desde ahí en los catálogos que lo consumen: Claude, clientes MCP, directorios).

## 1. Publicar la nueva versión en npm (requiere login)

```bash
cd banco-de-ideas-mcp
npm login            # cuenta de npm del owner
npm publish          # publica 1.1.0 (incluye el campo mcpName, que el registro valida)
```

> El campo `"mcpName": "io.github.damiancolo/banco-de-ideas-mcp"` en `package.json`
> es obligatorio: el registro MCP lo usa para verificar que el paquete npm te pertenece.

## 2. Publicar en el registro oficial de MCP

```bash
# Instalar el publisher (una vez)
brew install mcp-publisher
# o: curl -fsSL https://registry.modelcontextprotocol.io/install.sh | sh

# Autenticarse con GitHub (el namespace io.github.damiancolo se valida contra tu cuenta)
mcp-publisher login github

# Publicar (lee server.json de este directorio)
mcp-publisher publish
```

Si el esquema de `server.json` cambió desde que se escribió este archivo,
`mcp-publisher publish` lo va a indicar con un error de validación — ajustar según el mensaje.

## 3. Directorios adicionales (gratis, con cuenta web)

- **Smithery**: https://smithery.ai → "Add server" con el repo de GitHub
- **Glama**: https://glama.ai/mcp/servers → se indexa solo desde el registro oficial; verificar que aparezca
- **PulseMCP / mcp.so**: envío manual con el link del repo

## Verificar

Antes de publicar, probar por stdio contra un entorno de pruebas (`BANCO_API_URL=<preview>`): `tools/list` debe mostrar 7 herramientas (`leer_ideas`, `leer_idea`, `publicar_bisociacion`, `publicar_idea`, `comentar_idea`, `buscar_ideas`, `estadisticas`) con `annotations`, y `package.json` y `server.json` deben decir 1.1.0.

Comandos de publicación de la 1.1.0:

```bash
npm publish && mcp-publisher publish
```

Después de publicar:

```bash
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=banco-de-ideas" | head
```
