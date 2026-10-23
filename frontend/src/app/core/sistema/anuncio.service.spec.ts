import { TestBed } from '@angular/core/testing';
import { AnuncioService } from './anuncio.service';

describe('AnuncioService', () => {
  it('muestra lo publicado tras la siguiente navegación y lo retira en la posterior', () => {
    const anuncios = TestBed.inject(AnuncioService);
    const anuncio = { tipo: 'exito' as const, titulo: 'Hola', texto: 'Listo.' };
    anuncios.publicar(anuncio);
    expect(anuncios.visible()).toBeNull();
    anuncios.alNavegar();
    expect(anuncios.visible()).toEqual(anuncio);
    anuncios.alNavegar();
    expect(anuncios.visible()).toBeNull();
  });

  it('descartar() lo retira de inmediato', () => {
    const anuncios = TestBed.inject(AnuncioService);
    anuncios.publicar({ tipo: 'info', titulo: 'A', texto: 'B' });
    anuncios.alNavegar();
    anuncios.descartar();
    expect(anuncios.visible()).toBeNull();
  });
});
