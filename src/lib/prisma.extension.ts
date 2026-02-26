import { Prisma } from '@prisma/client';

export const softDeleteExtension = Prisma.defineExtension({
  name: 'soft-delete',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        // 1. Dynamically check if this model has a 'deletedAt' field in the schema
        const modelDef = Prisma.dmmf.datamodel.models.find(
          (m) => m.name === model,
        );
        const hasDeletedAt = modelDef?.fields.some(
          (f) => f.name === 'deletedAt',
        );

        // If it doesn't have the field, pass the query through untouched
        if (!hasDeletedAt) {
          return query(args);
        }

        // Bypass the TypeScript union terror
        const typedArgs = args as any;

        // 2. For list/first queries, safely inject the soft-delete filter
        if (
          ['findMany', 'findFirst', 'count', 'aggregate'].includes(operation)
        ) {
          typedArgs.where = { ...typedArgs.where, deletedAt: null };
          return query(typedArgs);
        }

        // 3. For unique queries, we CANNOT modify the 'where' clause.
        // We fetch the record and enforce the soft-delete check in memory.
        if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
          const result = await query(args);

          if (result && (result as any).deletedAt !== null) {
            if (operation === 'findUniqueOrThrow') {
              throw Object.assign(new Error(`No ${model} found`), {
                code: 'P2025',
                clientVersion: Prisma.prismaVersion.client,
              });
            }
            return null; // Pretend it doesn't exist
          }
          return result;
        }

        // For creates, updates, and deletes, execute normally
        return query(args);
      },
    },
  },
});
