import {
    CmsContentModelField,
    CmsContentModel,
    CmsContentModelUpdateInput
} from "@webiny/api-headless-cms/types";
import { ContentModelFieldModel } from "./models";

export const createFieldModels = async (
    model: CmsContentModel,
    data: CmsContentModelUpdateInput
): Promise<CmsContentModelField[]> => {
    const fields: CmsContentModelField[] = [];
    for (const field of data.fields) {
        const fieldData = new ContentModelFieldModel().populate(field);
        await fieldData.validate();
        fields.push(await fieldData.toJSON());
    }
    return fields;
};
