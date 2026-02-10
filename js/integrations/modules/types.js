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
 * @property {(key: string) => any} getRuntime
 * @property {(key: string, value: any) => void} setRuntime
 * @property {(key: string) => string|null} getStorageKey
 */

/**
 * @typedef {Object} IntegrationStorageService
 * @property {(key: string) => string|null} getItem
 * @property {(key: string, value: string) => void} setItem
 * @property {(key: string) => void} removeItem
 */

/**
 * @typedef {Object} IntegrationStatusService
 * @property {(message: string|{message: string, level?: 'info'|'success'|'warning'|'error', statusId?: string, toast?: boolean}, level?: 'info'|'success'|'warning'|'error') => void} notify
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
 * @property {(...args: any[]) => Promise<Response>} fetch
 */

/**
 * @typedef {Object} IntegrationServices
 * @property {IntegrationConfigService} config
 * @property {IntegrationStorageService} storage
 * @property {IntegrationStatusService} status
 * @property {IntegrationGraphService|null} graph
 * @property {IntegrationNetworkService} network
 */

/**
 * @typedef {Object} IntegrationModuleRegistry
 * @property {(module: IntegrationModule) => IntegrationModule} register
 * @property {(id: string) => (IntegrationModule|null)} get
 * @property {() => IntegrationModule[]} list
 * @property {(services: IntegrationServices) => Promise<void>} initAll
 * @property {(id: string, actionName: string, ctx: IntegrationActionContext, params?: any) => any} runAction
 */
