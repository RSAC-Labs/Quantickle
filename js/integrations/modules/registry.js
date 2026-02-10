(function() {
    const createRegistry = () => {
        const modules = new Map();

        const register = (module) => {
            if (!module || typeof module.id !== 'string' || !module.id.trim()) {
                throw new Error('Integration module must define a non-empty id');
            }
            if (typeof module.actions !== 'object' || module.actions === null) {
                throw new Error(`Integration module "${module.id}" must define actions`);
            }
            modules.set(module.id, module);

            const allowedHosts = Array.isArray(module.allowedHosts) ? module.allowedHosts : [];
            const runtime = window.IntegrationsManager?.runtime;
            if (allowedHosts.length && runtime) {
                if (!Array.isArray(runtime.integrationHosts)) {
                    runtime.integrationHosts = [];
                }
                const normalized = allowedHosts
                    .map(host => (host == null ? '' : String(host)).trim().toLowerCase())
                    .filter(Boolean);
                const current = new Set(runtime.integrationHosts.map(host => host.toLowerCase()));
                normalized.forEach(host => current.add(host));
                runtime.integrationHosts = Array.from(current);
            }
            return module;
        };

        const get = (id) => modules.get(id) || null;

        const list = () => Array.from(modules.values());

        const initAll = async (services) => {
            const initPromises = list().map(async (module) => {
                if (typeof module.init === 'function') {
                    await module.init(services);
                }
            });
            await Promise.all(initPromises);
        };

        const runAction = (id, actionName, ctx, params) => {
            const module = get(id);
            if (!module) {
                throw new Error(`Integration module "${id}" not registered`);
            }
            const action = module.actions?.[actionName];
            if (typeof action !== 'function') {
                throw new Error(`Integration action "${actionName}" not found on module "${id}"`);
            }
            return action(ctx || {}, params);
        };

        return {
            register,
            get,
            list,
            initAll,
            runAction
        };
    };

    window.IntegrationModuleRegistry = {
        create: createRegistry
    };
})();
