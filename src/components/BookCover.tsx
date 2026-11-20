import { useState } from 'react';
import { BookOpen, FileText, Film, Image, Music, Presentation } from 'lucide-react';
import type { LibraryItem } from '../library/model';

const icons = { pdf: BookOpen, video: Film, audio: Music, image: Image, presentation: Presentation, text: FileText };

export function BookCover({ item, large = false }: { item: LibraryItem; large?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const kind = item.mediaKind ?? 'pdf';
  const Icon = icons[kind];
  return (
    <span className={`book-cover cover-${kind}`} aria-hidden="true">
      {item.coverUrl && failedUrl !== item.coverUrl ? (
        <span className="book-cover-frame">
          <img
            src={item.coverUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailedUrl(item.coverUrl)}
          />
          <span className="book-spine-crease" />
          <span className="book-edge-highlight" />
        </span>
      ) : (
        <span className="book-jacket">
          <span className="book-jacket-header">
            <Icon size={large ? 28 : 19} strokeWidth={1.5} />
          </span>
          {large && <bdi>{item.name.replace(/\.[^.]+$/, '') || item.name}</bdi>}
          <span className="book-spine-crease" />
          <span className="book-edge-highlight" />
        </span>
      )}
    </span>
  );
}
