# AlexNet

## Network Architecture and Design
### Network Architecture
Consists of five convolutional layers and three fully-connected layers with a final 1000-way softmax.
### Non-Saturating Neurons
Used to speed up training, specifically Rectified Linear Units (ReLUs).
### ReLU Nonlinearity
Allows faster training compared to traditional saturating nonlinearities like tanh.
### Local Response Normalization
Aids generalization by implementing a form of lateral inhibition.
### Overlapping Pooling
Reduces error rates by using pooling units with overlapping neighborhoods.
### Depth Importance
Removing any convolutional layer resulted in inferior performance, emphasizing depth's importance.

## Training Methodology
### Large Convolutional Neural Network
Trained on 1.2 million high-resolution images for classification into 1000 classes.
### Training on Multiple GPUs
Network spread across two GPUs to accommodate large model size.
### GPU Implementation
Highly-optimized GPU implementation of 2D convolution to improve training efficiency.
### Stochastic Gradient Descent
Used for training with a batch size of 128, momentum of 0.9, and weight decay of 0.0005.
### Learning Rate Adjustment
Learning rate manually adjusted, starting at 0.01 and reduced as needed.

## Regularization and Data Augmentation
### Dropout Regularization
Employed to reduce overfitting in fully-connected layers.
### Dropout Technique
Sets neuron outputs to zero with probability 0.5 during training to prevent co-adaptation.
### Data Augmentation
Includes image translations, horizontal reflections, and altering RGB channel intensities.
### PCA on RGB Values
Used to alter intensities of RGB channels for data augmentation.

## Datasets and Preprocessing
### ImageNet Dataset
Over 15 million labeled high-resolution images in over 22,000 categories.
### ILSVRC Subset
Used a subset with roughly 1.2 million training images, 50,000 validation images, and 150,000 testing images.
### Image Preprocessing
Images down-sampled to 256x256 resolution and centered by subtracting mean activity.

## Performance and Results
### Top-1 and Top-5 Error Rates [Important]
Achieved error rates of 37.5% and 17.0% on test data, respectively.
### ILSVRC-2010 Results [Table]
Achieved top-1 and top-5 error rates of 37.5% and 17.0%, respectively.
### ILSVRC-2012 Results [Table]
Achieved a winning top-5 test error rate of 15.3%.
### Qualitative Evaluations [Visual]
Visualizations of convolutional kernels and network predictions on test images.
### Feature Vector Similarity
Euclidean distance between feature vectors used to assess image similarity.

## Future Directions
### Future Potential
Larger networks and longer training expected to improve results further.
### Video Sequences
Potential future application of large CNNs to video sequences for improved temporal information.