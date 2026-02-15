/**
 * @typedef {Object} IntegrationActionContext
 * @property {string} [source]
 * @property {Object} [node]
 * @property {Object[]} [nodes]
 * @property {Object} [metadata]
 */

/**
 * @typedef {Object} IntegrationModule
 * @property {string} id
 * @property {(services: IntegrationServices) => (void|Promise<void>)} [init]
 * @property {Object.<string, (ctx: IntegrationActionContext, params?: any) => any>} actions
 */

/**
 * @typedef {Object} IntegrationConfigService
 * @property {(key: string) => any} getRuntime Required.
 * @property {(key: string, value: any) => void} setRuntime Required.
 * @property {(key: string) => string|null} getStorageKey Required.
 */

/**
 * @typedef {Object} IntegrationStorageService
 * @property {(key: string) => string|null} getItem Required.
 * @property {(key: string, value: string) => void} setItem Required.
 * @property {(key: string) => void} removeItem Required.
 */

/**
 * @typedef {Object} IntegrationStatusService
 * @property {(message: string|{message: string, level?: 'info'|'success'|'warning'|'error', statusId?: string, toast?: boolean}, level?: 'info'|'success'|'warning'|'error') => void} notify Required.
 */

/**
 * @typedef {Object} IntegrationCredentialsService
 * @property {() => Promise<void>} ensurePassphrase Required for integrations that store encrypted credentials.
 * @property {(value: string) => Promise<string>} encrypt Required for integrations that store encrypted credentials.
 * @property {(value: string) => Promise<string>} decrypt Optional. Used when modules need decrypt access.
 */

/**
 * @typedef {Object} IntegrationGraphService
 * @property {() => (Object|null)} getCy
 * @property {() => (Object|null)} getGraphData
 * @property {(graphData: Object, options?: Object) => boolean} setGraphData
 * @property {(name: string, options?: Object) => boolean} setGraphName
 * @property {() => boolean} renderGraph
 * @property {() => boolean} updateGraphUI
 * @property {() => boolean} applyLayout
 */

/**
 * @typedef {Object} IntegrationNetworkService
 * @property {(...args: any[]) => Promise<Response>} fetch Required fallback HTTP transport.
 */

/**
 * @typedef {Object} IntegrationServerApiAdapter
 * @property {(path?: string, options?: RequestInit) => Promise<Response>} request Required.
 */

/**
 * @typedef {Object} IntegrationSerpApiServerAdapter
 * @property {(params?: string|Object<string, any>, options?: RequestInit) => Promise<Response>} request Required.
 */

/**
 * @typedef {Object} IntegrationServerService
 * @property {IntegrationServerApiAdapter} misp Required for proxied MISP endpoints under `/api/integrations/misp/*`.
 * @property {IntegrationServerApiAdapter} neo4j Required for Neo4j integration endpoints under `/api/neo4j/*` (including proxied database calls under `/api/neo4j/db/*`).
 * @property {IntegrationSerpApiServerAdapter} serpapi Required for proxied SerpApi endpoint `/api/serpapi`.
 */

/**
 * @typedef {Object} IntegrationTaskHooks
 * @property {() => boolean} [isRunning] Optional.
 * @property {(running: boolean) => void} [setRunning] Optional.
 * @property {() => boolean} [isCancelRequested] Optional.
 * @property {() => void} [requestCancel] Optional.
 * @property {() => void} [resetCancel] Optional.
 * @property {(label?: string) => (string|null)} [beginProgress] Optional.
 * @property {(taskId: string|null, label: string) => void} [updateProgress] Optional.
 * @property {(taskId: string|null) => void} [endProgress] Optional.
 */

/**
 * @typedef {Object} IntegrationTasksService
 * @property {IntegrationTaskHooks} opml Required for OPML scan progress + cancellation wiring.
 * @property {IntegrationTaskHooks} misp Required for MISP import progress + cancellation wiring.
 */

/**
 * @typedef {Object} IntegrationManagerFacade
 * @property {() => {baseUrl: string, username?: string, authKey?: string}} [getCirclLuConfiguration]
 * @property {() => string} [getDefaultMispFeedUrl]
 * @property {() => string} [getLastMispFeedUrl]
 * @property {(feedUrl: string) => string} [normalizeMispFeedUrl]
 * @property {(feedUrl: string) => Promise<{manifest: Object, descriptors: Object[]}>} [fetchCirclMispManifest]
 * @property {(feedUrl: string, descriptor: Object) => Promise<Object>} [fetchMispEventPayload]
 * @property {(options?: Object) => Promise<Object>} [importCirclMispFeed]
 * @property {(opmlUrl: string) => Promise<string>} [fetchOpmlText]
 * @property {(opmlText: string) => Object[]} [parseOpmlFeeds]
 * @property {(feeds: Object[], options?: Object) => void} [setOpmlFeeds]
 * @property {() => Promise<void>} [refreshOpmlExistingGraphCache]
 * @property {(feed: Object, statusId?: string) => Promise<Object>} [processOpmlFeed]
 * @property {() => void} [persistOpmlState]
 * @property {(feeds?: Object[]) => void} [updateOpmlFeedListDisplay]
 * @property {() => void} [updateOpmlControls]
 * @property {(info: Object) => string} [formatInfoHTML]
 * @property {(info: Object) => string} [formatInfoText]
 * @property {() => void} [updateNeo4jMenuVisibility]
 */

/**
 * Contract for module dependencies. `config`, `storage`, `status`, `credentials`, `network`, `server`, and `tasks` are required.
 * `integrations` and `graph` are optional facades for richer integrations.
 *
 * @typedef {Object} IntegrationServices
 * @property {IntegrationConfigService} config Required.
 * @property {IntegrationStorageService} storage Required.
 * @property {IntegrationStatusService} status Required.
 * @property {IntegrationCredentialsService} credentials Required.
 * @property {IntegrationNetworkService} network Required.
 * @property {IntegrationServerService} server Required.
 * @property {IntegrationTasksService} tasks Required.
 * @property {IntegrationManagerFacade} [integrations] Optional manager facade.
 * @property {IntegrationGraphService|null} [graph] Optional graph adapter.
 */

/**
 * @typedef {Object} IntegrationModuleRegistry
 * @property {(module: IntegrationModule) => IntegrationModule} register
 * @property {(id: string) => (IntegrationModule|null)} get
 * @property {() => IntegrationModule[]} list
 * @property {(services: IntegrationServices) => Promise<void>} initAll
 * @property {(id: string, actionName: string, ctx: IntegrationActionContext, params?: any) => any} runAction
 */
