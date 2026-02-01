# Neo4j Integration

Quantickle can store graph data in a [Neo4j](https://neo4j.com/) database.
The local development server exposes an endpoint that writes the current graph
structure to Neo4j via the HTTP Query API (v2).

## Configuration

The connection details can be supplied via HTTP headers or environment variables.
If the headers are absent the environment variables are used:

- `X-Neo4j-Url` or `NEO4J_URL` – HTTP base URL (default `http://localhost:7474`)
- `X-Neo4j-Username` or `NEO4J_USER` – database username (default `neo4j`)
- `X-Neo4j-Password` or `NEO4J_PASSWORD` – database password (default `neo4j`)
- `X-Neo4j-Db` or `NEO4J_DB` – database name (default `neo4j`)

## Local installation guide

### Windows

1. Download the latest Neo4j Desktop or Neo4j Server ZIP from the
   [Neo4j download page](https://neo4j.com/download/).
2. Run the installer (Neo4j Desktop) or extract the ZIP archive to a
   directory without spaces (Neo4j Server).
3. If you installed the server ZIP, open a PowerShell prompt, change to the
   extracted directory, and run `bin\neo4j console`.
4. When prompted for an initial password, record it for use inside Quantickle.

### macOS

1. Install Neo4j Desktop from the official
   [macOS download](https://neo4j.com/download/) **or** install the community
   edition via Homebrew: `brew install neo4j`.
2. Start the database:
   - Neo4j Desktop: create a new local DBMS and click **Start**.
   - Homebrew service: run `neo4j start` from the terminal.
3. Capture the connection password shown during the first launch.

### Linux

1. Use your package manager or download a tarball from the
   [Neo4j Linux installation guide](https://neo4j.com/docs/operations-manual/current/installation/).
2. For Debian/Ubuntu based systems run `sudo apt install neo4j`.
   For Red Hat/CentOS use `sudo yum install neo4j`.
3. Start the service with `sudo systemctl start neo4j` and note the initial
   password requested at first login.

### Enable HTTP access on port 7474

Neo4j enables an HTTP listener by default. If it was disabled, edit
`neo4j.conf` and ensure the following settings are present (uncomment them if
necessary):

```
dbms.connector.http.enabled=true
dbms.connector.http.listen_address=0.0.0.0:7474
```

Restart the Neo4j service after making configuration changes.

### Configure Quantickle

1. Open **File → Graph Store → Neo4j Setup Guide** in Quantickle to return to
   these instructions.
2. Enter the Neo4j HTTP URL (`http://localhost:7474` by default), username, and
   password inside the Integrations panel.
3. Once saved, the Graph Store **Search**, **Load**, and **Save** options will
   become available.

## API Endpoints

Send a POST request containing Quantickle graph data to persist it and include
the credentials as headers. The body uses the flattened node/edge structure that
`.qut` files export:

```bash
curl -X POST http://localhost:3000/api/neo4j/graph \
  -H 'Content-Type: application/json' \
  -H 'X-Neo4j-Url: http://localhost:7474' \
  -H 'X-Neo4j-Username: neo4j' \
  -H 'X-Neo4j-Password: secret' \
  -d '{
        "metadata": { "name": "Demo" },
        "nodes": [
          { "id": "a", "label": "Alpha", "type": "server", "x": 120, "y": 340 }
        ],
        "edges": [
          { "id": "edge-a-b", "source": "a", "target": "b", "label": "connects" }
        ]
      }'
```

Nodes are stored with label `QuantickleNode` and edges with label `RELATIONSHIP`.
Repeated requests merge data rather than duplicating nodes. All node and edge
properties are saved, including layout coordinates, containerization flags, and
locked or pinned states. Graph-level metadata (`metadata` object, layout
settings, custom properties) is stored on the corresponding `QuantickleGraph`
node, and a `savedAt` timestamp is automatically added.

### Retrieve graphs

- `GET /api/neo4j/graphs` – returns the list of stored graphs with summary data.
- `POST /api/neo4j/node-graphs` – supply `{ "labels": ["Alpha", "Beta"] }` to
  find graphs containing nodes with matching labels.
- `GET /api/neo4j/graph/:name` – fetches a full graph with `metadata`, `nodes`,
  and `edges` (all flattened).

```bash
curl -H 'X-Neo4j-Url: http://localhost:7474' \
     -H 'X-Neo4j-Username: neo4j' \
     -H 'X-Neo4j-Password: secret' \
     http://localhost:3000/api/neo4j/graph/MyGraph
```

The response mirrors the structure of a `.qut` file, providing a `metadata`
object along with arrays of `nodes` and `edges`.

### Delete graphs

- `DELETE /api/neo4j/graph/:name` – removes the named graph from Neo4j.
- `DELETE /api/neo4j/graph` – accepts `{ "name": "GraphName" }` in the body as
  an alternative to the URL parameter.

## Usage in Client Code

```javascript
// graphData should contain { nodes: [], edges: [] }
await fetch('/api/neo4j/graph', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Neo4j-Url': 'http://localhost:7474',
    'X-Neo4j-Username': 'neo4j',
    'X-Neo4j-Password': 'secret'
  },
  body: JSON.stringify(graphData)
});
```
