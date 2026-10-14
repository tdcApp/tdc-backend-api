import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { FirebaseAdminService } from '../auth/firebase-admin.service';

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            findByFirebaseUid: jest.fn(),
            createProfile: jest.fn(),
            updateProfile: jest.fn(),
            findAllStudents: jest.fn(),
          },
        },
        {
          provide: FirebaseAdminService,
          useValue: {
            getAuth: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
