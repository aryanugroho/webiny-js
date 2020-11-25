import { flow } from "lodash";
import { validation } from "@webiny/validation";
import { withProps } from "@webiny/commodo";
import mdbid from "mdbid";
import content from "./pbPage/contentField";
import withLatestVersion from "./pbPage/withLatestVersion";
import {
    withFields,
    onSet,
    skipOnPopulate,
    string,
    boolean,
    number,
    object,
    date,
    ref,
    fields,
    withName,
    withHooks
} from "@webiny/commodo";

export default ({ createBase, context, PbCategory, PbSettings }) => {
    const PbPageSettings = withFields(() => {
        const fields = {};
        context.plugins
            .byType("pb-page-settings-model")
            .forEach(plugin => plugin.apply({ fields, context }));
        return fields;
    })();

    const PbPage: any = flow(
        withName("PbPage"),
        withFields(instance => ({
            category: ref({ instanceOf: PbCategory, validation: validation.create("required") }),
            publishedOn: skipOnPopulate()(date()),
            title: onSet(value => (instance.locked ? instance.title : value))(
                string({ validation: validation.create("required") })
            ),
            snippet: onSet(value => (instance.locked ? instance.snippet : value))(string()),
            url: onSet(value => (instance.locked ? instance.url : value))(
                string({ validation: validation.create("required") })
            ),
            content: onSet(value => (instance.locked ? instance.content : value))(
                content({ context })
            ),
            settings: onSet(value => (instance.locked ? instance.settings : value))(
                fields({
                    instanceOf: PbPageSettings
                })
            ),
            version: number(),
            pattern: boolean(),
            dataSources: object({ list: true, value: [] }),
            parent: context.commodo.fields.id(),
            published: flow(
                onSet(value => {
                    // Deactivate previously published revision
                    if (value && value !== instance.published && instance.isExisting()) {
                        instance.locked = true;
                        instance.publishedOn = new Date();
                        const removeBeforeSave = instance.hook("beforeSave", async () => {
                            removeBeforeSave();
                            // Deactivate previously published revision
                            const publishedRev = await PbPage.findOne({
                                query: { published: true, parent: instance.parent }
                            });

                            if (publishedRev) {
                                publishedRev.published = false;
                                await publishedRev.save();
                            }
                        });

                        const removeAfterSave = instance.hook("afterSave", async () => {
                            removeAfterSave();
                            await instance.hook("afterPublish");
                        });
                    }
                    return value;
                })
            )(boolean({ value: false })),
            locked: skipOnPopulate()(boolean({ value: false }))
        })),
        withProps({
            async getNextVersion() {
                const revision = await PbPage.findOne({
                    query: { parent: this.parent, deleted: { $in: [true, false] } },
                    sort: { version: -1 }
                });

                if (!revision) {
                    return 1;
                }

                return revision.version + 1;
            },
            get isHomePage() {
                // eslint-disable-next-line no-async-promise-executor
                return new Promise(async resolve => {
                    const settings = await PbSettings.load();
                    resolve(settings.data.pages.home === this.parent);
                }).catch(() => false);
            },
            get isErrorPage() {
                // eslint-disable-next-line no-async-promise-executor
                return new Promise(async resolve => {
                    const settings = await PbSettings.load();
                    resolve(settings.data.pages.error === this.parent);
                }).catch(() => false);
            },
            get isNotFoundPage() {
                // eslint-disable-next-line no-async-promise-executor
                return new Promise(async resolve => {
                    const settings = await PbSettings.load();
                    resolve(settings.data.pages.notFound === this.parent);
                }).catch(() => false);
            },
            get revisions() {
                // eslint-disable-next-line no-async-promise-executor
                return new Promise(async resolve => {
                    const revisions = await PbPage.find({
                        query: { parent: this.parent },
                        sort: { version: -1 }
                    });
                    resolve(revisions);
                });
            },
            get fullUrl() {
                return new Promise(async (resolve, reject) => {
                    try {
                        const settings = await PbSettings.load();
                        resolve(settings.data.domain.replace(/\/+$/g, "") + this.url);
                    } catch (e) {
                        reject(e);
                    }
                });
            }
        }),
        withHooks({
            async beforeCreate() {
                if (!this.id) {
                    this.id = mdbid();
                }

                if (!this.parent) {
                    this.parent = this.id;
                }

                if (!this.title) {
                    this.title = "Untitled";
                }

                if (!this.url) {
                    this.url = (await this.category).url + "untitled-" + this.id;
                }

                this.version = await this.getNextVersion();

                if (!this.settings) {
                    this.settings = {
                        general: {
                            layout: (await this.category).layout
                        }
                    };
                }
            },
            async beforeSave() {
                if (this.locked) {
                    return;
                }

                this.pattern = this.url.includes("{");
            },
            async afterDelete() {
                // If the deleted page is the root page - delete its revisions
                if (this.id === this.parent) {
                    // Delete all revisions
                    const revisions = await PbPage.find({
                        query: { parent: this.parent }
                    });

                    return Promise.all(revisions.map(rev => rev.delete()));
                }
            }
        }),
        withLatestVersion()
    )(createBase());

    return PbPage;
};
