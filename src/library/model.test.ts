import { beforeEach, expect, it } from 'vitest';
import { localStorage } from '../platform/storage';
import { selectFiles, readFavorites, writeFavorites, type LibraryItem } from './model';
const files: LibraryItem[] = [
 { id:'pdf',name:'دَرس 2.pdf',lastOpened:1,lastPage:1,totalPages:4,sizeBytes:100,available:true },
 { id:'video',name:'Lesson 10.mp4',lastOpened:2,lastPage:1,totalPages:1,sizeBytes:300,available:true,mediaKind:'video' },
 { id:'slides',name:'Lesson 2.pptx',lastOpened:3,lastPage:1,totalPages:2,sizeBytes:200,available:true,mediaKind:'presentation' }
];
beforeEach(() => localStorage.clear());
it('combines text, type and favorite filters without mutating source history', () => {
 expect(selectFiles(files,'درس','pdf',[],false,'recent').map(f=>f.id)).toEqual(['pdf']);
 expect(selectFiles(files,'lesson','all',['slides'],true,'size').map(f=>f.id)).toEqual(['slides']);
 expect(files.map(f=>f.id)).toEqual(['pdf','video','slides']);
 expect(selectFiles(files,'lesson','all',[],false,'name').map(f=>f.id)).toEqual(['slides','video']);
});
it('handles malformed favorite storage and uses stable storage keys', () => {
 localStorage.setItem('library-favorites-v1','{"bad":true}'); expect(readFavorites()).toEqual([]);
 expect(writeFavorites(['pdf','video'])).toBe(true); expect(readFavorites()).toEqual(['pdf','video']);
 expect(globalThis.localStorage.getItem('library-favorites-v1')).toBe('["pdf","video"]');
});
