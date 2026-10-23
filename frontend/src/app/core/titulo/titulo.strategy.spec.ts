import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { TituloStrategy } from './titulo.strategy';

@Component({ template: '' })
class Vacia {}

describe('TituloStrategy', () => {
  it('pone «<título> · SIGA-SP» en cada ruta', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'a', title: 'Mis citas', component: Vacia },
          { path: 'b', component: Vacia },
        ]),
        { provide: TitleStrategy, useClass: TituloStrategy },
      ],
    });
    const router = TestBed.inject(Router);
    const title = TestBed.inject(Title);
    await router.navigateByUrl('/a');
    expect(title.getTitle()).toBe('Mis citas · SIGA-SP');
    await router.navigateByUrl('/b');
    expect(title.getTitle()).toBe('SIGA-SP');
  });
});
