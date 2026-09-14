import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import JSZip from 'jszip';
import { kml } from '@tmcw/togeojson';
import { FeatureCollection } from 'geojson';

@Injectable({ providedIn: 'root' })
export class KmzLayerService {
  constructor(private http: HttpClient) { }

  async load(url: string): Promise<FeatureCollection> {
    const archive = await JSZip.loadAsync(
      await firstValueFrom(this.http.get(url, { responseType: 'blob' }))
    );
    const kmlEntry = Object.values(archive.files).find(file =>
      !file.dir && file.name.toLowerCase().endsWith('.kml')
    );

    if (!kmlEntry) {
      throw new Error(`El archivo KMZ no contiene un KML: ${url}`);
    }

    const document = new DOMParser().parseFromString(
      await kmlEntry.async('text'),
      'application/xml'
    );
    return kml(document) as FeatureCollection;
  }
}