// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { WelcomeScreen } from './WelcomeScreen';
import { removeMedia, listMedia } from '../media/library';
import { getRecentDocumentsList } from '../core/storage/documents';
vi.mock('../core/storage/documents',()=>({ getRecentDocumentsList:vi.fn(async()=>[{id:'pdf',name:'Lesson.pdf',lastOpened:2,lastPage:2,totalPages:4,sizeBytes:200,available:true}]),removeDocumentFromStorage:vi.fn(),clearAllStoredDocuments:vi.fn() }));
vi.mock('../media/library',()=>({ APP_FILE_ACCEPT:'.pdf,.mp4',listMedia:vi.fn(async()=>[{id:'media:video',name:'Video.mp4',mediaKind:'video',lastOpened:1,lastPage:1,totalPages:1,sizeBytes:400,available:true}]),removeMedia:vi.fn(async()=>{}) }));
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let host:HTMLDivElement,root:Root;
const props={ currentTheme:'paper' as const,currentLang:'ar' as const,onThemeChange:vi.fn(),onToggleLanguage:vi.fn(),onOpenFile:vi.fn(),onOpenRecent:vi.fn() };
beforeEach(async()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(<WelcomeScreen {...props}/>));});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('opens a saved file from the classic recent list',async()=>{
 await act(async()=> (host.querySelector('[aria-label="فتح Lesson.pdf"]') as HTMLElement).click());
 expect(props.onOpenRecent).toHaveBeenCalledWith(expect.objectContaining({id:'pdf'}));
 expect(host.querySelector('[aria-label="فتح Video.mp4"]')).not.toBeNull();
});
it('closes the theme picker with Escape and returns focus to its trigger',async()=>{
 const trigger=host.querySelector<HTMLButtonElement>('[aria-controls="home-reading-themes"]')!;
 await act(async()=>trigger.click());
 expect(trigger.getAttribute('aria-expanded')).toBe('true');
 await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
 expect(host.querySelector('#home-reading-themes')).toBeNull();
 expect(document.activeElement).toBe(trigger);
});
it('requires explicit confirmation before deleting media and preserves it when cancelled',async()=>{
 await act(async()=> (host.querySelector('button[aria-label="حذف من المكتبة: Video.mp4"]') as HTMLButtonElement).click());
 expect(host.querySelector('dialog')).not.toBeNull(); expect(removeMedia).not.toHaveBeenCalled();
 await act(async()=>[...host.querySelectorAll('dialog button')].find(b=>b.textContent==='إلغاء')!.dispatchEvent(new MouseEvent('click',{bubbles:true})));
 expect(removeMedia).not.toHaveBeenCalled(); expect(host.querySelector('[aria-label="فتح Video.mp4"]')).not.toBeNull();
});
it('does not open a file when using the delete button keyboard',async()=>{
 const button=host.querySelector('button[aria-label="حذف من المكتبة: Video.mp4"]')!;
 await act(async()=>button.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
 expect(props.onOpenRecent).not.toHaveBeenCalled();
});
it('deletes media only after confirming',async()=>{
 await act(async()=> (host.querySelector('button[aria-label="حذف من المكتبة: Video.mp4"]') as HTMLButtonElement).click());
 await act(async()=>[...host.querySelectorAll('dialog button')].find(b=>b.textContent==='حذف')!.dispatchEvent(new MouseEvent('click',{bubbles:true})));
 expect(removeMedia).toHaveBeenCalledWith('media:video');
});
it('preserves previously loaded files when refreshing one storage source fails',async()=>{
 vi.mocked(listMedia).mockRejectedValueOnce(new Error('storage blocked'));
 await act(async()=> (host.querySelector('button[aria-label="حذف من المكتبة: Lesson.pdf"]') as HTMLButtonElement).click());
 await act(async()=>[...host.querySelectorAll('dialog button')].find(b=>b.textContent==='حذف')!.dispatchEvent(new MouseEvent('click',{bubbles:true})));
 expect(host.querySelector('[aria-label="فتح Video.mp4"]')).not.toBeNull();
 expect(host.querySelector('[role="alert"]')?.textContent).toContain('تعذر تحميل');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='إعادة المحاولة')!.click());
 expect(host.querySelector('[role="alert"]')).toBeNull();
});
it('shows a recoverable error even when the entire library fails to load',async()=>{
 await act(async()=>root.unmount());
 vi.mocked(listMedia).mockRejectedValueOnce(new Error('blocked'));
 vi.mocked(getRecentDocumentsList).mockRejectedValueOnce(new Error('blocked'));
 root=createRoot(host);
 await act(async()=>root.render(<WelcomeScreen {...props}/>));
 expect(host.querySelector('[role="alert"]')?.textContent).toContain('إعادة المحاولة');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='إعادة المحاولة')!.click());
 expect(host.querySelector('[aria-label="فتح Lesson.pdf"]')).not.toBeNull();
});
