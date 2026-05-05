# AlexNet: ImageNet Classification with Deep CNNs

## Dataset
#### ImageNet LSVRC
#### 1.2 million images
#### 1000 categories
#### Down-sampled to 256x256 resolution

## Architecture Features

### ReLU Nonlinearity
#### Non-saturating neurons
#### Faster training than tanh

### Multi-GPU Training
#### Two GTX 580 GPUs
#### Cross-GPU parallelization

### Local Response Normalization
#### Lateral inhibition
#### Improves generalization

### Overlapping Pooling
#### Stride s=2, size z=3
#### Reduces error rates

## Network Structure
#### 8 weight layers
#### 5 Convolutional layers
#### 3 Fully-connected layers
#### 60 million parameters
#### 1000-way Softmax output

## Reducing Overfitting

### Data Augmentation
#### Random 224x224 patches
#### Horizontal reflections
#### PCA-based RGB intensity changes

### Dropout
#### Applied to first two FC layers
#### 0.5 probability
#### Reduces co-adaptation

## Learning Details
#### Stochastic Gradient Descent
#### Batch size 128
#### Momentum 0.9
#### Weight decay 0.0005
#### Initial learning rate 0.01

## Results

### ILSVRC-2010
#### 37.5% top-1 error
#### 17.0% top-5 error

### ILSVRC-2012
#### 15.3% winning top-5 error
#### Learned frequency/orientation kernels