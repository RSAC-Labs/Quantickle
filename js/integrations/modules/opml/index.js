(function() {
    const createOpmlIntegrationModule = () => {
        let services = null;

        const notify = (message, level = 'info', options = {}) => {
            services?.status?.notify?.({ message, level, statusId: 'opmlStatus', ...options });
        };

        return {
            id: 'opml',
            init: async (providedServices) => {
                services = providedServices;
            },
            actions: {
                loadFromUrl: async () => {
                    const manager = services?.integrations;
                    const urlInput = document.getElementById('opmlFeedUrl');
                    const targetUrl = urlInput?.value?.trim();
                    if (!targetUrl) {
                        notify('Enter an OPML URL to load', 'warning', { toast: false });
                        return { ok: false };
                    }

                    try {
                        notify('Fetching OPML...', 'loading', { toast: false });
                        const opmlText = await manager.fetchOpmlText(targetUrl);
                        const textarea = document.getElementById('opmlFeedInput');
                        if (textarea) {
                            textarea.value = opmlText;
                        }
                        const feeds = manager.parseOpmlFeeds(opmlText);
                        manager.setOpmlFeeds(feeds, { opmlXml: opmlText });
                        const message = feeds.length
                            ? `Loaded ${feeds.length} feed${feeds.length === 1 ? '' : 's'} from OPML`
                            : 'No feeds were detected in the OPML file';
                        notify(message, feeds.length ? 'success' : 'warning', { toast: false });
                        return { ok: true, feeds };
                    } catch (error) {
                        console.error('Failed to load OPML from URL', error);
                        notify('Unable to fetch OPML file (check proxy allowlist)', 'error', { toast: false });
                        return { ok: false, error };
                    }
                },
                importFeeds: async () => {
                    const manager = services?.integrations;
                    const textarea = document.getElementById('opmlFeedInput');
                    const opmlText = textarea?.value?.trim();
                    if (!opmlText) {
                        notify('Paste OPML XML before importing', 'warning', { toast: false });
                        return { ok: false };
                    }

                    const feeds = manager.parseOpmlFeeds(opmlText);
                    manager.setOpmlFeeds(feeds, { opmlXml: opmlText });
                    const message = feeds.length
                        ? `Imported ${feeds.length} feed${feeds.length === 1 ? '' : 's'} from OPML`
                        : 'No feeds found in OPML input';
                    notify(message, feeds.length ? 'success' : 'warning', { toast: false });
                    return { ok: true, feeds };
                },
                cancelScan: () => {
                    const taskService = services?.tasks?.opml;
                    if (!taskService?.isRunning?.()) {
                        notify('No OPML scan is currently running.', 'info', { toast: false });
                        return { ok: false, skipped: true };
                    }
                    taskService.requestCancel();
                    notify('Cancelling OPML scan...', 'info', { toast: false });
                    return { ok: true };
                },
                runScan: async (_ctx = {}, options = {}) => {
                    const manager = services?.integrations;
                    const taskService = services?.tasks?.opml;
                    const statusId = options.statusId || 'opmlStatus';
                    const opmlFeeds = services?.config?.getRuntime?.('opmlFeeds') || [];
                    if (!Array.isArray(opmlFeeds) || opmlFeeds.length === 0) {
                        manager.updateOpmlFeedListDisplay([]);
                        notify('No OPML feeds configured', 'warning', { statusId, toast: false });
                        return { feedsChecked: 0, newArticles: 0, iocGraphs: 0 };
                    }

                    if (taskService?.isRunning?.()) {
                        return { feedsChecked: 0, newArticles: 0, iocGraphs: 0, skipped: true };
                    }

                    taskService?.setRunning?.(true);
                    taskService?.resetCancel?.();
                    notify('Checking OPML feeds...', 'loading', { statusId, toast: false });
                    const graphTaskId = taskService?.beginProgress?.('Checking OPML feeds...');

                    try {
                        await manager.refreshOpmlExistingGraphCache();
                    } catch (error) {
                        console.warn('Unable to refresh OPML graph cache; duplicate detection may be incomplete.', error);
                    }

                    let feedsChecked = 0;
                    let newArticles = 0;
                    let iocGraphs = 0;
                    let cancelled = false;

                    try {
                        for (const feed of opmlFeeds) {
                            if (taskService?.isCancelRequested?.()) {
                                cancelled = true;
                                break;
                            }
                            const progressLabel = feed?.title || feed?.url || 'OPML feed';
                            taskService?.updateProgress?.(
                                graphTaskId,
                                `Scanning ${progressLabel} (${feedsChecked + 1}/${opmlFeeds.length})`
                            );
                            const result = await manager.processOpmlFeed(feed, statusId);
                            feedsChecked += 1;
                            newArticles += result.newArticles || 0;
                            iocGraphs += result.iocGraphs || 0;
                            if (taskService?.isCancelRequested?.() || result.cancelled) {
                                cancelled = true;
                                break;
                            }
                        }

                        if (cancelled) {
                            notify('OPML scan cancelled', 'warning', { statusId, toast: false });
                            return { feedsChecked, newArticles, iocGraphs, cancelled: true };
                        }

                        const opmlLastRun = new Date().toISOString();
                        services?.config?.setRuntime?.('opmlLastRun', opmlLastRun);
                        const lastRunStorageKey = services?.config?.getStorageKey?.('OPML_LAST_RUN');
                        if (lastRunStorageKey) {
                            services?.storage?.setItem?.(lastRunStorageKey, opmlLastRun);
                        }
                        manager.persistOpmlState();
                        manager.updateOpmlFeedListDisplay();

                        const summary = `Checked ${feedsChecked} feed${feedsChecked === 1 ? '' : 's'}; ${newArticles} new article${newArticles === 1 ? '' : 's'}; ${iocGraphs} graph${iocGraphs === 1 ? '' : 's'} created`;
                        notify(summary, 'success', { statusId, toast: false });

                        return { feedsChecked, newArticles, iocGraphs };
                    } catch (error) {
                        console.error('OPML feed check failed', error);
                        notify(error.message || 'OPML feed check failed', 'error', { statusId, toast: false });
                        return { feedsChecked, newArticles, iocGraphs, error };
                    } finally {
                        taskService?.endProgress?.(graphTaskId);
                        taskService?.setRunning?.(false);
                        taskService?.resetCancel?.();
                    }
                }
            }
        };
    };

    window.OpmlIntegrationModule = {
        create: createOpmlIntegrationModule
    };
})();
