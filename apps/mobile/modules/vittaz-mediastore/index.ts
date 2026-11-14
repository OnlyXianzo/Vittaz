import { requireNativeModule } from "expo-modules-core";

export interface VittazMediaStoreNative {
  saveJsonToDownloadsAsync(
    subfolder: string,
    filename: string,
    contents: string,
  ): Promise<string>;
}

let nativeModule: VittazMediaStoreNative | null = null;

export function getVittazMediaStore(): VittazMediaStoreNative | null {
  if (nativeModule) return nativeModule;
  try {
    nativeModule =
      requireNativeModule<VittazMediaStoreNative>("VittazMediaStore");
    return nativeModule;
  } catch {
    return null;
  }
}

export async function saveJsonToDownloadsDirectly(
  subfolder: string,
  filename: string,
  contents: string,
): Promise<string | null> {
  const mod = getVittazMediaStore();
  if (!mod) return null;
  return mod.saveJsonToDownloadsAsync(subfolder, filename, contents);
}
