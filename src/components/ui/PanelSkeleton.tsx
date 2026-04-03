import { Skeleton } from './Skeleton';

interface PanelSkeletonProps {
  variant: 'mixer' | 'pianoRoll' | 'effects' | 'editor';
}

function MixerSkeleton() {
  return (
    <div className="flex gap-1 p-2 h-[300px] bg-daw-surface" data-testid="mixer-skeleton">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex flex-col items-center gap-2 w-16 p-1.5">
          <Skeleton width={40} height={10} rounded="sm" />
          <Skeleton width={6} height={120} rounded="sm" />
          <Skeleton width={32} height={32} rounded="full" />
          <Skeleton width={40} height={8} rounded="sm" />
        </div>
      ))}
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-3 h-[250px] bg-daw-surface" data-testid="editor-skeleton">
      <div className="flex gap-2">
        <Skeleton width={80} height={24} rounded="sm" />
        <Skeleton width={60} height={24} rounded="sm" />
      </div>
      <div className="flex-1 flex gap-1">
        <div className="w-12 flex flex-col gap-1">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} height={16} rounded="sm" />
          ))}
        </div>
        <div className="flex-1">
          <Skeleton width="100%" height="100%" rounded="sm" />
        </div>
      </div>
    </div>
  );
}

export function PanelSkeleton({ variant }: PanelSkeletonProps) {
  switch (variant) {
    case 'mixer':
      return <MixerSkeleton />;
    case 'pianoRoll':
    case 'effects':
    case 'editor':
      return <EditorSkeleton />;
  }
}
