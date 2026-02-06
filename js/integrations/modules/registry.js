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
