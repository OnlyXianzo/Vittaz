package com.vittaz.modules.mediastore

import android.content.ContentValues
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.io.IOException

class VittazMediaStoreModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VittazMediaStore")

    AsyncFunction("saveJsonToDownloadsAsync") { subfolder: String, filename: String, contents: String ->
      val context = appContext.reactContext ?: throw IOException("App context lost")
      val safeSubfolder = subfolder.replace(Regex("[^a-zA-Z0-9._-]"), "_")
      val safeFilename = if (filename.endsWith(".json")) filename else "$filename.json"
      val relativePath = "${Environment.DIRECTORY_DOWNLOADS}/$safeSubfolder"

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val values = ContentValues().apply {
          put(MediaStore.MediaColumns.DISPLAY_NAME, safeFilename)
          put(MediaStore.MediaColumns.MIME_TYPE, "application/json")
          put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath)
          put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val resolver = context.contentResolver
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
          ?: throw IOException("MediaStore insert failed")
        try {
          resolver.openOutputStream(uri)?.use { out ->
            out.write(contents.toByteArray(Charsets.UTF_8))
          } ?: throw IOException("Failed to open MediaStore output stream")
        } catch (e: Exception) {
          try {
            resolver.delete(uri, null, null)
          } catch (_: Exception) {}
          throw e
        }
        values.clear()
        values.put(MediaStore.MediaColumns.IS_PENDING, 0)
        resolver.update(uri, values, null, null)
        return@AsyncFunction "Downloads/$safeSubfolder/$safeFilename"
      } else {
        @Suppress("DEPRECATION")
        val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        val targetDir = File(downloadsDir, safeSubfolder)
        if (!targetDir.exists()) {
          targetDir.mkdirs()
        }
        val targetFile = File(targetDir, safeFilename)
        FileOutputStream(targetFile).use { out ->
          out.write(contents.toByteArray(Charsets.UTF_8))
        }
        return@AsyncFunction "Downloads/$safeSubfolder/$safeFilename"
      }
    }
  }
}
