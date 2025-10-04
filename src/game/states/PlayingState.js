import { State } from './State.js';
import { Player } from '../entities/Player.js';
import { Book } from '../entities/Book.js';
import { Shelf } from '../entities/Shelf.js';
import { Kid } from '../entities/Kid.js';

// Object pooling
class ObjectPool {
  constructor(creationFunc, initialSize = 20) {
    this.creationFunc = creationFunc;
    this.pool = [];
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(creationFunc());
    }
  }

  get() {
    if (this.pool.length > 0) {
      return this.pool.pop();
    }
    return this.creationFunc();
  }

  release(obj) {
    this.pool.push(obj);
  }
}


export class PlayingState extends State {
  constructor(game) {
    super(game);
    this.instanceId = Math.random().toString(36).substring(7); // Unique ID for debugging
    console.log(`[RESTART DEBUG] Creating new PlayingState instance: ${this.instanceId}`);
    this.player = null;
    this.kids = [];
    this.books = [];
    this.shelves = [];
    this.particles = [];
    
    // Object pools for optimization
    this.particlePool = new ObjectPool(() => ({
      type: 'xp',
      x: 0,
      y: 0,
      text: '',
      vy: 0,
      lifetime: 0,
      age: 0
    }));

    this.bookPool = new ObjectPool(() => new Book(this.game, 0, 0, 'red'));

    // World bounds
    this.worldWidth = 1600;
    this.worldHeight = 1040;
    
    // Kid spawning
    this.kidSpawnTimer = 0;
    this.kidSpawnInterval = 10;
    this.maxKids = 3;
    
    // Performance optimizations
    this.floorPattern = null;
    this.patternCanvas = null;
    
    // Background music
    this.bgMusic = null;
    this.musicLoaded = false;
    
    // Sound effects
    this.pickupSounds = [];
    this.shelfSound = null;
    
    this.spawnPoints = [
      { x: 50, y: 520 },
      { x: 1550, y: 520 },
      { x: 800, y: 50 },
      { x: 800, y: 990 }
    ];
  }
  
  enter() {
    console.log(`[RESTART DEBUG] PlayingState.enter() called for instance: ${this.instanceId}`);
    
    this.kids = [];
    this.books = [];
    this.particles = [];
    this.shelves = [];
    
    // Reset game data
    this.game.gameData = {
      chaosLevel: 0,
      maxChaos: 100,
      playerLevel: 1,
      xp: 0,
      xpToNext: 100,
      elapsedTime: 0,
      targetTime: 30 * 60,
      isPaused: false,
      booksCollected: 0,
      booksShelved: 0,
      kidsRepelled: 0
    };
    
    this.maxKids = 3;
    this.kidSpawnTimer = 0;
    this.kidSpawnInterval = 10;
    
    this.initializeLevel();
    
    if (!this.bgMusic) {
      this.bgMusic = new Audio('/game_music.mp3');
      this.bgMusic.loop = true;
      this.bgMusic.volume = 0.4;
      
      this.bgMusic.addEventListener('loadeddata', () => {
        this.musicLoaded = true;
        this.bgMusic.play().catch(e => console.log('Game music play failed:', e));
      });
      
      this.bgMusic.load();
    } else {
      this.bgMusic.play().catch(e => console.log('Game music play failed:', e));
    }
    
    if (this.pickupSounds.length === 0) {
      for (let i = 0; i < 5; i++) {
        const audio = new Audio('/pickup_book.mp3');
        audio.volume = 0.7;
        this.pickupSounds.push(audio);
      }
    }
    
    if (!this.shelfSound) {
      this.shelfSound = new Audio('/book_on_shelf.mp3');
      this.shelfSound.volume = 0.6;
    }
  }
  
  exit() {
    this.kids = [];
    this.books = [];
    this.particles = [];
    this.shelves = [];
    
    this.maxKids = 3;
    this.kidSpawnTimer = 0;
    this.kidSpawnInterval = 10;
    
    if (this.bgMusic) {
      this.bgMusic.pause();
    }
    
    if (this.player) {
      this.player.cleanup();
    }
  }
  
  initializeLevel() {
    this.generateLibraryLayout();
    
    this.player = new Player(
      this.game,
      50,
      300
    );
    
    this.game.camera.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.game.camera.follow(this.player);
    
    const initialKids = 2;
    for (let i = 0; i < initialKids; i++) {
      const spawnPoint = this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
      const kid = new Kid(this.game, spawnPoint.x, spawnPoint.y, 1);
      this.kids.push(kid);
    }
    
    this.kidSpawnTimer = 10;
  }
  
  update(deltaTime) {
    const input = this.game.inputManager;
    const gameData = this.game.gameData;
    
    if (input.isKeyPressed('p') || input.isKeyPressed('Escape')) {
      if (this.bgMusic) {
        this.bgMusic.pause();
      }
      this.game.stateManager.pushState('paused');
      return;
    }
    
    if (gameData.isPaused) return;
    
    gameData.elapsedTime += deltaTime;
    
    if (gameData.elapsedTime >= gameData.targetTime) {
      this.game.stateManager.changeState('gameover', { won: true });
      return;
    }
    
    this.updateChaos(deltaTime);
    
    if (gameData.chaosLevel >= gameData.maxChaos) {
      this.game.stateManager.changeState('gameover', { won: false, reason: 'chaos' });
      return;
    }
    
    if (this.player) {
      this.player.update(deltaTime);
    }
    
    for (const shelf of this.shelves) {
      shelf.update(deltaTime);
    }
    
    for (const book of this.books) {
      book.update(deltaTime);
    }
    
    for (const kid of this.kids) {
      kid.update(deltaTime);
    }
    
    this.updateKidSpawning(deltaTime);
    this.checkBookPickup();
    this.checkBookSnatching();
    this.checkBookShelving();
    this.updateParticles(deltaTime);
  }
  
  updateChaos(deltaTime) {
    const gameData = this.game.gameData;
    const booksOnFloor = this.books.filter(book => !book.isHeld && !book.isShelved).length;
    
    if (booksOnFloor > 0) {
      const chaosRate = booksOnFloor * 0.1;
      const chaosDampening = this.player?.stats?.chaosDampening || 0;
      const chaosMultiplier = 1 - (chaosDampening / 100);
      gameData.chaosLevel += chaosRate * deltaTime * chaosMultiplier;
    } else if (gameData.chaosLevel > 0) {
      gameData.chaosLevel -= 0.5 * deltaTime;
    }
    
    gameData.chaosLevel = Math.max(0, Math.min(gameData.maxChaos, gameData.chaosLevel));
  }
  
  render(renderer, interpolation) {
    const ctx = renderer.ctx;
    const { width, height } = this.game;
    
    this.renderFloor(ctx);
    
    const viewportX = this.game.camera.getViewportX();
    const viewportY = this.game.camera.getViewportY();
    const viewportWidth = this.game.camera.viewportWidth / this.game.camera.zoom;
    const viewportHeight = this.game.camera.viewportHeight / this.game.camera.zoom;
    
    // Culling: Only render entities within the viewport
    const renderables = [
      ...this.shelves,
      ...this.books.filter(book => !book.isHeld && !book.isShelved),
      ...this.kids,
      this.player
    ].filter(entity => entity && this.isInViewport(entity, viewportX, viewportY, viewportWidth, viewportHeight));

    // Sort by y-coordinate for proper z-ordering
    renderables.sort((a, b) => (a.y + a.height) - (b.y + b.height));

    for (const entity of renderables) {
        renderer.addToLayer('entities', entity);
    }
    
    this.renderParticles(renderer);
    renderer.render(interpolation);
    this.renderUI(ctx);
  }
  
  isInViewport(entity, viewX, viewY, viewWidth, viewHeight) {
    return (
      entity.x < viewX + viewWidth &&
      entity.x + entity.width > viewX &&
      entity.y < viewY + viewHeight &&
      entity.y + entity.height > viewY
    );
  }

  renderUI(ctx) {
    const gameData = this.game.gameData;
    const { width, height } = this.game;

    ctx.save();

    // Chaos meter
    const meterWidth = 300;
    const meterHeight = 30;
    const meterX = width / 2 - meterWidth / 2;
    const meterY = 20;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(meterX - 2, meterY - 2, meterWidth + 4, meterHeight + 4);

    const chaosPercent = gameData.chaosLevel / gameData.maxChaos;
    const chaosColor = chaosPercent > 0.8 ? '#ff0000' :
      chaosPercent > 0.6 ? '#ff8800' :
      chaosPercent > 0.4 ? '#ffff00' : '#00ff00';

    ctx.fillStyle = chaosColor;
    ctx.fillRect(meterX, meterY, meterWidth * chaosPercent, meterHeight);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`CHAOS: ${Math.floor(gameData.chaosLevel)}%`, width / 2, meterY + meterHeight / 2);

    // Timer and Kid Counter
    const timeRemaining = Math.max(0, gameData.targetTime - gameData.elapsedTime);
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = Math.floor(timeRemaining % 60);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(width - 120, 15, 110, 40);

    ctx.font = '24px Arial';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(`${minutes}:${seconds.toString().padStart(2, '0')}`, width - 65, 40);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(width - 120, 60, 110, 35);

    ctx.font = '18px Arial';
    ctx.fillStyle = '#fff';
    ctx.fillText(`Kids: ${this.kids.length}/${this.maxKids}`, width - 65, 82);

    // Player Stats
    const panelX = 10;
    const panelY = 10;
    const panelWidth = 250;
    const panelHeight = 150;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight);

    ctx.textAlign = 'left';
    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = '#fff';
    ctx.fillText(`Level ${gameData.playerLevel}`, panelX + 10, panelY + 30);

    const xpBarX = panelX + 10;
    const xpBarY = panelY + 40;
    const xpBarWidth = panelWidth - 20;
    const xpBarHeight = 15;

    ctx.fillStyle = '#333';
    ctx.fillRect(xpBarX, xpBarY, xpBarWidth, xpBarHeight);

    const xpPercent = gameData.xp / gameData.xpToNext;
    ctx.fillStyle = '#4169E1';
    ctx.fillRect(xpBarX, xpBarY, xpBarWidth * xpPercent, xpBarHeight);

    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText(`${gameData.xp} / ${gameData.xpToNext} XP`, xpBarX + xpBarWidth / 2, xpBarY + xpBarHeight / 2 + 1);

    if (this.player) {
      ctx.textAlign = 'left';
      ctx.font = '16px Arial';
      ctx.fillStyle = '#fff';
      ctx.fillText('Stamina', panelX + 10, panelY + 80);

      const staminaBarX = panelX + 75;
      const staminaBarY = panelY + 65;
      const staminaBarWidth = panelWidth - 85;
      const staminaBarHeight = 20;

      ctx.fillStyle = '#333';
      ctx.fillRect(staminaBarX, staminaBarY, staminaBarWidth, staminaBarHeight);

      const staminaPercent = this.player.stats.stamina / this.player.stats.maxStamina;
      ctx.fillStyle = '#00aaff';
      ctx.fillRect(staminaBarX, staminaBarY, staminaBarWidth * staminaPercent, staminaBarHeight);

      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.floor(this.player.stats.stamina)} / ${this.player.stats.maxStamina}`, staminaBarX + staminaBarWidth / 2, staminaBarY + staminaBarHeight / 2 + 1);

      ctx.font = '16px Arial';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff';
      ctx.fillText(`Books: ${this.player.carriedBooks.length} / ${this.player.stats.carrySlots}`, panelX + 10, panelY + 105);

      if (this.player.isSprinting && this.player.stats.stamina > 0) {
        ctx.fillStyle = '#ffff00';
        ctx.fillText('SPRINTING', panelX + 10, panelY + 130);
      }
    }

    ctx.restore();
  }

  renderFloor(ctx) {
    const woodFloorImage = this.game.assetLoader.getImage('woodFloor');

    if (!woodFloorImage || !woodFloorImage.complete) {
      const viewportX = this.game.camera.getViewportX();
      const viewportY = this.game.camera.getViewportY();
      const viewportWidth = this.game.camera.viewportWidth / this.game.camera.zoom;
      const viewportHeight = this.game.camera.viewportHeight / this.game.camera.zoom;

      this.game.renderer.addToLayer('background', (ctx) => {
        ctx.fillStyle = '#d4a574';
        ctx.fillRect(viewportX, viewportY, viewportWidth, viewportHeight);
      });
      return;
    }

    if (!this.floorPattern) {
      const scale = 0.5;
      this.patternCanvas = document.createElement('canvas');
      this.patternCanvas.width = woodFloorImage.width * scale;
      this.patternCanvas.height = woodFloorImage.height * scale;
      const patternCtx = this.patternCanvas.getContext('2d');
      patternCtx.drawImage(woodFloorImage, 0, 0, this.patternCanvas.width, this.patternCanvas.height);
      this.floorPattern = this.game.renderer.ctx.createPattern(this.patternCanvas, 'repeat');
    }

    this.game.renderer.addToLayer('background', (ctx) => {
      if (this.floorPattern) {
        ctx.save();
        ctx.fillStyle = this.floorPattern;
        ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);
        ctx.restore();
      }
    });
  }

  updateKidSpawning(deltaTime) {
    const minutes = this.game.gameData.elapsedTime / 60;
    
    if (minutes > 5) this.maxKids = 10;
    else if (minutes > 2) this.maxKids = 5;

    if (this.kids.length >= this.maxKids) return;

    this.kidSpawnTimer -= deltaTime;

    if (this.kidSpawnTimer <= 0) {
      let aggressionLevel = 1;
      if (minutes >= 10) aggressionLevel = 3;
      else if (minutes >= 5) aggressionLevel = 2;

      const spawnPoint = this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
      const kid = new Kid(this.game, spawnPoint.x, spawnPoint.y, aggressionLevel);
      this.kids.push(kid);
      
      this.kidSpawnTimer = this.kidSpawnInterval;
    }
  }

  generateLibraryLayout() {
    const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
    const shelfSpacingX = 160;
    const shelfSpacingY = 200;
    const startX = 100;
    const startY = 100;
    const rows = 4;
    const cols = 8;
    
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = startX + col * shelfSpacingX;
        const y = startY + row * shelfSpacingY;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const shelf = new Shelf(this.game, x, y, color);
        this.shelves.push(shelf);

        for (let i = 0; i < shelf.capacity; i++) {
          const book = this.bookPool.get();
          book.x = 0;
          book.y = 0;
          book.color = color;
          shelf.addBook(book);
          this.books.push(book);
        }
      }
    }
  }

  isPlayerNearShelf(shelf, distance) {
    if (!this.player) return false;
    
    const playerBounds = this.player.getBounds();
    const shelfBounds = shelf.getBounds();

    return (
      playerBounds.x < shelfBounds.x + shelfBounds.width + distance &&
      playerBounds.x + playerBounds.width > shelfBounds.x - distance &&
      playerBounds.y < shelfBounds.y + shelfBounds.height + distance &&
      playerBounds.y + playerBounds.height > shelfBounds.y - distance
    );
  }

  checkBookPickup() {
    if (!this.player) return;

    const pickupRadius = this.player.stats.pickupRadius * 32;
    const playerCenterX = this.player.getCenterX();
    const playerCenterY = this.player.getCenterY();

    for (const book of this.books) {
      if (book.isHeld || book.isShelved) continue;

      const distance = Math.sqrt(
        Math.pow(book.getCenterX() - playerCenterX, 2) +
        Math.pow(book.getCenterY() - playerCenterY, 2)
      );

      if (distance <= pickupRadius) {
        if (this.player.pickupBook(book)) {
          book.pickup(this.player);
          this.game.gameData.booksCollected++;
          this.game.gameData.chaosLevel -= 0.5;
          this.awardXP(5);
          this.playPickupSound();
        }
      }
    }
  }

  checkBookShelving() {
    if (!this.player || this.player.carriedBooks.length === 0) return;

    const returnRadius = this.player.stats.returnRadius * 32;

    for (const shelf of this.shelves) {
      if (this.isPlayerNearShelf(shelf, returnRadius) && shelf.hasEmptySlots()) {
        const book = this.player.shelveBook(shelf);
        if (book && shelf.addBook(book)) {
          this.game.gameData.booksShelved++;
          this.game.gameData.chaosLevel -= 1.0;
          this.awardXP(10);
          this.playShelfSound();
        }
      }
    }
  }

  awardXP(amount) {
    const gameData = this.game.gameData;
    const xpMultiplier = this.player?.getXPMultiplier() || 1;
    const multipliedAmount = Math.floor(amount * xpMultiplier);
    gameData.xp += multipliedAmount;

    if (this.player) {
      const particle = this.particlePool.get();
      particle.type = 'xp';
      particle.x = this.player.getCenterX();
      particle.y = this.player.y - 10;
      particle.text = `+${multipliedAmount} XP`;
      particle.vy = -50;
      particle.lifetime = 1.5;
      particle.age = 0;
      this.particles.push(particle);
    }

    while (gameData.xp >= gameData.xpToNext) {
      gameData.xp -= gameData.xpToNext;
      gameData.playerLevel++;
      if (this.player) {
        this.player.stats.stamina = this.player.stats.maxStamina;
      }
      gameData.xpToNext = Math.floor(100 * Math.pow(1.45, gameData.playerLevel - 1));
      this.game.stateManager.pushState('upgradeSelection');
    }
  }

  updateParticles(deltaTime) {
    this.particles = this.particles.filter(particle => {
      particle.age += deltaTime;
      if (particle.type === 'xp') {
        particle.y += particle.vy * deltaTime;
        particle.vy += 100 * deltaTime;
      }
      if (particle.age >= particle.lifetime) {
        this.particlePool.release(particle);
        return false;
      }
      return true;
    });
  }

  renderParticles(renderer) {
    renderer.addToLayer('ui', (ctx) => {
      ctx.save();
      for (const particle of this.particles) {
        if (particle.type === 'xp') {
          const alpha = 1 - (particle.age / particle.lifetime);
          ctx.globalAlpha = alpha;
          ctx.font = 'bold 18px Arial';
          ctx.fillStyle = '#ffff00';
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 2;
          ctx.textAlign = 'center';
          ctx.strokeText(particle.text, particle.x, particle.y);
          ctx.fillText(particle.text, particle.x, particle.y);
        }
      }
      ctx.restore();
    });
  }

  checkBookSnatching() {
    if (!this.player || this.player.carriedBooks.length >= this.player.stats.carrySlots) return;

    const snatchRadius = this.player.repelRadius;
    const playerCenterX = this.player.getCenterX();
    const playerCenterY = this.player.getCenterY();

    for (const kid of this.kids) {
      if (!kid.carriedBook) continue;

      const distance = Math.sqrt(
        Math.pow(kid.getCenterX() - playerCenterX, 2) +
        Math.pow(kid.getCenterY() - playerCenterY, 2)
      );

      if (distance <= snatchRadius) {
        const book = kid.carriedBook;
        kid.carriedBook = null;
        kid.dropBookTimer = 0;

        if (this.player.pickupBook(book)) {
          book.pickup(this.player);
          this.game.gameData.booksCollected++;
          kid.state = 'fleeing';
          this.game.gameData.chaosLevel -= 0.75;
          this.awardXP(7);
          this.playPickupSound();
        }
      }
    }
  }

  playPickupSound() {
    for (const audio of this.pickupSounds) {
      if (audio.paused || audio.ended) {
        audio.currentTime = 0;
        audio.play().catch(e => console.log('Pickup sound play failed:', e));
        return;
      }
    }
    if (this.pickupSounds.length > 0) {
      this.pickupSounds[0].currentTime = 0;
      this.pickupSounds[0].play().catch(e => console.log('Pickup sound play failed:', e));
    }
  }

  playShelfSound() {
    if (this.shelfSound) {
      this.shelfSound.currentTime = 0;
      this.shelfSound.play().catch(e => console.log('Shelf sound play failed:', e));
    }
  }
}