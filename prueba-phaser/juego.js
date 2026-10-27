// Una escena agrupa los objetos y las reglas de una pantalla del juego.
class Practica extends Phaser.Scene {
  constructor() {
    super('Practica');
  }

  randomMonedaPositions(count) {
    const positions = [];
    for (let i = 0; i < count; i++) {
      const x = Phaser.Math.Between(50, 750);
      const y = Phaser.Math.Between(50, 430);
      positions.push([x, y]);
    }
    return positions;
  }

  // create se ejecuta al iniciar (o reiniciar) la escena.
  // No necesitamos preload: dibujamos las figuras sin cargar imágenes.
  create() {
    this.puntos = 0;
    this.marcador = this.add.text(20, 20, 'Monedas: 0 / 5', {
      fontSize: '22px', color: '#ffffff'
    });

    this.jugador = this.add.rectangle(80, 240, 32, 32, 0x38bdf8);
    this.physics.add.existing(this.jugador);
    this.jugador.body.setCollideWorldBounds(true);

    this.monedas = this.physics.add.staticGroup();
    for (const [x, y] of this.randomMonedaPositions(5)) {
      const moneda = this.add.circle(x, y, 12, 0xfacc15);
      this.monedas.add(moneda);
    }

    // overlap detecta el contacto sin impedir que el jugador avance.
    this.physics.add.overlap(this.jugador, this.monedas, (jugador, moneda) => {
      moneda.destroy();
      this.puntos += 1;
      this.marcador.setText(`Monedas: ${this.puntos} / 5`);
      if (this.puntos === 5) {
        this.add.text(400, 240, '¡Ganaste! Pulsa R para repetir', {
          fontSize: '24px', color: '#86efac', backgroundColor: '#101827'
        }).setOrigin(0.5);
      }
    });

    this.flechas = this.input.keyboard.createCursorKeys();
    this.teclado = this.input.keyboard.addKeys('W,A,S,D');
    this.input.keyboard.on('keydown-R', () => this.scene.restart());
  }

  // update se ejecuta en cada fotograma y consulta las teclas presionadas.
  update() {
    const direccion = new Phaser.Math.Vector2(
      Number(this.teclado['D'].isDown) - Number(this.teclado['A'].isDown),
      Number(this.teclado['S'].isDown) - Number(this.teclado['W'].isDown)
    );
    // Normalizar evita que las diagonales sean más rápidas.
    direccion.normalize().scale(350);
    this.jugador.body.setVelocity(direccion.x, direccion.y);
  }

  
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 480,
  backgroundColor: '#1e293b',
  physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: true } },
  scene: Practica
});
