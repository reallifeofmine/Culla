import { NativeModule, requireNativeModule } from 'expo';
import type { Access, EditParams, MediaColumns, RawAnalysis, Saved } from './CullaNative.types';

declare class CullaNativeModule extends NativeModule<{}> {
  getAccess(): Access;
  requestAccess(): Promise<Access>;
  listMedia(trashed: boolean): Promise<MediaColumns>;
  analyze(ids: string[], readText: boolean[]): Promise<RawAnalysis[]>;
  readText(id: string): Promise<string | null>;
  /** Shows Android's confirmation; resolves true if the user agreed. */
  trash(ids: string[]): Promise<boolean>;
  restore(ids: string[]): Promise<boolean>;
  deleteForever(ids: string[]): Promise<boolean>;
  compress(id: string, maxDim: number, quality: number): Promise<Saved>;
  autoParams(id: string): Promise<Required<Omit<EditParams, 'rotate' | 'crop'>>>;
  saveEdit(id: string, edit: EditParams): Promise<Saved>;
  storage(): Promise<{ total: number; free: number }>;
}

export default requireNativeModule<CullaNativeModule>('CullaNative');
