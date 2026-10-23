import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateInterestDto, UpdateInterestDto } from './dto/interest.dto';
import { Interest } from './entities/interest.entity';

@Injectable()
export class InterestsService {
  constructor(@InjectRepository(Interest) private readonly interests: Repository<Interest>) {}

  findAll(): Promise<Interest[]> {
    return this.interests.find({ order: { name: 'ASC' } });
  }

  async findByIds(ids: number[]): Promise<Interest[]> {
    const uniqueIds = [...new Set(ids)];
    const interests = await this.interests.findByIds(uniqueIds);
    if (interests.length !== uniqueIds.length)
      throw new NotFoundException('One or more interests do not exist');
    return interests;
  }

  async create(dto: CreateInterestDto): Promise<Interest> {
    const name = dto.name.trim();
    if (await this.interests.exists({ where: { name } }))
      throw new ConflictException('Interest already exists');
    return this.interests.save(this.interests.create({ name }));
  }

  async update(id: number, dto: UpdateInterestDto): Promise<Interest> {
    const interest = await this.interests.findOne({ where: { id } });
    if (!interest) throw new NotFoundException(`Interest #${id} not found`);
    const name = dto.name.trim();
    if (name !== interest.name && (await this.interests.exists({ where: { name } }))) {
      throw new ConflictException('Interest already exists');
    }
    interest.name = name;
    return this.interests.save(interest);
  }

  async remove(id: number): Promise<void> {
    const result = await this.interests.delete(id);
    if (!result.affected) throw new NotFoundException(`Interest #${id} not found`);
  }
}
