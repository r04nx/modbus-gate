import React from 'react';
import clsx from 'clsx';

export const Skeleton = ({ className, ...props }) => {
    return (
        <div
            className={clsx("animate-pulse bg-surfaceHighlight/30 rounded", className)}
            {...props}
        />
    );
};

export const TableSkeleton = ({ rows = 5, columns = 4 }) => {
    return (
        <div className="w-full animate-in fade-in duration-500">
            <div className="flex items-center justify-between mb-4">
                <Skeleton className="h-8 w-32" />
                <div className="flex gap-2">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-8 w-24" />
                </div>
            </div>
            <div className="border border-surfaceHighlight/30 rounded-xl overflow-hidden">
                <div className="bg-surfaceHighlight/20 p-4 border-b border-surfaceHighlight/30 flex gap-4">
                    {Array.from({ length: columns }).map((_, i) => (
                        <Skeleton key={i} className="h-4 flex-1" />
                    ))}
                </div>
                <div className="divide-y divide-surfaceHighlight/10">
                    {Array.from({ length: rows }).map((_, i) => (
                        <div key={i} className="p-4 flex gap-4">
                            {Array.from({ length: columns }).map((_, j) => (
                                <Skeleton key={j} className="h-4 flex-1" />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export const CardSkeleton = () => {
    return (
        <div className="p-6 bg-surfaceHighlight/10 rounded-2xl border border-surfaceHighlight/30 space-y-4 animate-in fade-in duration-500">
            <div className="flex justify-between items-start">
                <div className="space-y-2">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-48" />
                </div>
                <Skeleton className="h-8 w-8 rounded-full" />
            </div>
            <div className="space-y-2 pt-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
            </div>
        </div>
    );
};

export const FormSkeleton = () => {
    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full rounded-xl" />
                </div>
                <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full rounded-xl" />
                </div>
            </div>
            <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-32 w-full rounded-xl" />
            </div>
            <div className="flex justify-end gap-3 pt-4">
                <Skeleton className="h-10 w-24 rounded-lg" />
                <Skeleton className="h-10 w-32 rounded-lg" />
            </div>
        </div>
    );
};
