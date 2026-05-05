# Alexnet

## Obtain Enough Computational Power

### Obtain Enough Computational Power

- Denotingbyai theactivityofaneuroncomputedbyapplyingkerneliatposition
x,y
(x,y) and then applying the ReLU nonlinearity, the response-normalized activity bi is given by
x,y
theexpression
 β
min(N−1,i+n/2)
(cid:88)
bi x,y =ai x,y /k+α (aj x,y )2 
j=max(0,i−n/2)
wherethesumrunsovern“adjacent”kernelmapsatthesamespatialposition, andN isthetotal
numberofkernelsinthelayer.Theorderingofthekernelmapsisofcoursearbitraryanddetermined
beforetrainingbegins.
- Thefirstconvolutionallayerfiltersthe224×224×3inputimagewith96kernelsofsize11×11×3
with a stride of 4 pixels (this is the distance between the receptive field centers of neighboring
3Wecannotdescribethisnetworkindetailduetospaceconstraints,butitisspecifiedpreciselybythecode
andparameterfilesprovidedhere:http://code.google.com/p/cuda-convnet/.
- networkwithReLUs(solidline)reachesa25%
trainingerrorrateonCIFAR-10sixtimesfaster
We are not the first to consider alternatives to tradi-
thananequivalentnetworkwithtanhneurons
tional neuron models in CNNs.
- However, the immense complexity of the object recognition task means that this prob-
lemcannotbespecifiedevenbyadatasetaslargeasImageNet,soourmodelshouldalsohavelots
of prior knowledge to compensate for all the data we don’t have.
- In terms of training time
with gradient descent, these saturating nonlinearities
are much slower than the non-saturating nonlinearity
f(x) = max(0,x).

### Datasetsoflabeledimageswererelatively Small — Ontheordero…

- Untilrecently, datasetsoflabeledimageswererelatively
small—ontheorderoftensofthousandsofimages(e.g.,NORB[16],Caltech-101/256[8,9],and
CIFAR-10/100 [12]).
- Wedothisbyextractingrandom224×224patches(andtheirhorizontalreflections)fromthe
256×256imagesandtrainingournetworkontheseextractedpatches4.Thisincreasesthesizeofour
trainingsetbyafactorof2048,thoughtheresultingtrainingexamplesare,ofcourse,highlyinter-
dependent.Withoutthisscheme,ournetworksuffersfromsubstantialoverfitting,whichwouldhave
forcedustousemuchsmallernetworks.
- Theconstantsk,n,α,andβ arehyper-parameterswhose
valuesaredeterminedusingavalidationset;weusedk = 2,n = 5,α = 10−4,andβ = 0.75.
- [10] G.E.Hinton,N.Srivastava,A.Krizhevsky,I.Sutskever,andR.R.Salakhutdinov.
- In
CircuitsandSystems(ISCAS),Proceedingsof2010IEEEInternationalSymposiumon,pages253–256.

### Cires ¸

- [25] P.Y.Simard, D.Steinkraus, andJ.C.Platt.
- [21] N.Pinto,D.D.Cox,andJ.J.DiCarlo.
- [4] D.Cires¸an,U.Meier,andJ.Schmidhuber.
- [5] D.C. Cires¸an, U. Meier, J. Masci, L.M.
- Gambardella, and J. Schmidhuber.

### Urlhttp :// Authors

- URLhttp://authors.library.caltech.edu/7694.
- Themagnitudeofthe
Caltech-101dataset.
- Caltech-256objectcategorydataset.

### Seefigure2 ).

- Thekernelsofthesecond,fourth,andfifthconvolutionallayersareconnectedonlytothosekernel
mapsinthepreviouslayerwhichresideonthesameGPU(seeFigure2).
- The fourth
convolutionallayerhas384kernelsofsize3×3×192,andthefifthconvolutionallayerhas256
kernelsofsize3×3×192.

### 5 ).

- We
appliedthisnormalizationafterapplyingtheReLUnonlinearityincertainlayers(seeSection3.5).

## Employ Essentially Puts Half

### Developedregularizationmethodcalled “ Dropout ”

- The
neural network, which has 60 million parameters and 650,000 neurons, consists
offiveconvolutionallayers, someofwhicharefollowedbymax-poolinglayers,
and three fully-connected layers with a final 1000-way softmax.
- 3.5 OverallArchitecture
NowwearereadytodescribetheoverallarchitectureofourCNN.AsdepictedinFigure2,thenet
containseightlayerswithweights;thefirstfiveareconvolutionalandtheremainingthreearefully-
connected.Theoutputofthelastfully-connectedlayerisfedtoa1000-waysoftmaxwhichproduces
adistributionoverthe1000classlabels.Ournetworkmaximizesthemultinomiallogisticregression
objective,whichisequivalenttomaximizingtheaverageacrosstrainingcasesofthelog-probability
ofthecorrectlabelunderthepredictiondistribution.
- Our final network contains five convolutional and
three fully-connected layers, and this depth seems to be important: we found that removing any
convolutionallayer(eachofwhichcontainsnomorethan1%ofthemodel’sparameters)resultedin
inferiorperformance.
- Response-normalizationlayers
followthefirstandsecondconvolutionallayers.Max-poolinglayers,ofthekinddescribedinSection
3.4, follow both response-normalization layers as well as the fifth convolutional layer.
- To reduce overfitting in the fully-connected
layersweemployedarecently-developedregularizationmethodcalled“dropout”
that proved to be very effective.

### 1Http :// Code

- The neurons which are
“dropped out” in this way do not contribute to the forward pass and do not participate in back-
propagation.Soeverytimeaninputispresented,theneuralnetworksamplesadifferentarchitecture,
butallthesearchitecturesshareweights.Thistechniquereducescomplexco-adaptationsofneurons,
since a neuron cannot rely on the presence of particular other neurons.
- 1http://code.google.com/p/cuda-convnet/
2

3.1 ReLUNonlinearity
The standard way to model a neuron’s output f as
a function of its input x is with f(x) = tanh(x)
or f(x) = (1 + e−x)−1.
- Thissortofresponsenormalizationimplementsaformoflateralinhibition
inspired by the type found in real neurons, creating competition for big activities amongst neuron
outputscomputedusingdifferentkernels.
- 2 TheDataset
ImageNetisadatasetofover15millionlabeledhigh-resolutionimagesbelongingtoroughly22,000
categories.

### Employ Essentially Puts Half

- To make train-
ing faster, we used non-saturating neurons and a very efficient GPU implemen-
tation of the convolution operation.
- The parallelization
scheme that we employ essentially puts half of the kernels (or neurons) on each GPU, with one
additional trick: the GPUs communicate only in certain layers.
- It is, therefore, forced to
learnmorerobustfeaturesthatareusefulinconjunctionwithmanydifferentrandomsubsetsofthe
other neurons.

### Small Euclidean Separation

- If two images produce feature activation
vectors with a small Euclidean separation, we can say that the higher levels of the neural network
considerthemtobesimilar.
- The second form of data augmentation consists of altering the intensities of the RGB channels in
training images.

## Used Several Effective Techniques

### Used Several Effective Techniques

- The second-best con-
test entry achieved an error rate of 26.2% with an approach that averages the predictions of sev-
eral classifiers trained on FVs computed from different types of densely-sampled features [7].
- Finally, we also report our error
rates on the Fall 2009 version of Model Top-1(val) Top-5(val) Top-5(test)
ImageNetwith10,184categories
SIFT+FVs[7] — — 26.2%
and 8.9 million images.
- Ournetworkcontains
anumberofnewandunusualfeatureswhichimproveitsperformanceandreduceitstrainingtime,
whicharedetailedinSection3.Thesizeofournetworkmadeoverfittingasignificantproblem,even
with 1.2 million labeled training examples, so we used several effective techniques for preventing
overfitting, which are described in Section 4.
- [26] S.C.Turaga,J.F.Murray,V.Jain,F.Roth,M.Helmstaedter,K.Briggman,W.Denk,andH.S.Seung.Con-
volutionalnetworkscanlearntogenerateaffinitygraphsforimagesegmentation.
- In Figure3: 96convolutionalkernelsofsize
otherwords,weightdecayhereisnotmerelyaregularizer: 11×11×3learnedbythefirstconvolutional
it reduces the model’s training error.

### Human Labelers Using Ama

- Weemploytwodistinctforms
of data augmentation, both of which allow transformed images to be produced from the original
images with very little computation, so the transformed images do not need to be stored on disk.
- The images were collected from the web and labeled by human labelers using Ama-
zon’s Mechanical Turk crowd-sourcing tool.
- Theircapacitycanbecon-
trolledbyvaryingtheirdepthandbreadth,andtheyalsomakestrongandmostlycorrectassumptions
about the nature of images (namely, stationarity of statistics and locality of pixel dependencies).
- Therefore, we down-sampled the images to a fixed resolution of 256 × 256.
- IntheleftpanelofFigure4wequalitativelyassesswhatthenetworkhaslearnedbycomputingits
top-5 predictions on eight test images.

### Pages609 – 616

- Master’sthesis, Departmentof
ComputerScience,UniversityofToronto,2009.
- Convolutionaldeepbeliefnetworksforscalableunsuper-
visedlearningofhierarchicalrepresentations.InProceedingsofthe26thAnnualInternationalConference
onMachineLearning,pages609–616.ACM,2009.
- PLoScomputationalbiology,5(11):e1000579,
2009.

## Scale Visual Recognition Challenge

### Scale Visual Recognition Challenge

- The best performance achieved during the ILSVRC-
2010 competition was 47.1% and 28.2% with an approach that averages the predictions produced
from six sparse-coding models trained on different features [2], and since then the best pub-
lished results are 45.7% and 25.7% with an approach that averages the predictions of two classi-
fiers trained on Fisher Vectors (FVs) computed from two types of densely-sampled features [24].
- 7 Discussion
Our results show that a large, deep convolutional neural network is capable of achieving record-
breaking results on a highly challenging dataset using purely supervised learning.
- Starting in 2010, as part of the Pascal Visual Object
Challenge, an annual competition called the ImageNet Large-Scale Visual Recognition Challenge
(ILSVRC)hasbeenheld.
- ILSVRC-2010 is the only version of ILSVRC for which the test set labels are available, so this is
the version on which we performed most of our experiments.
- Since there is no es-
tablishedtestset,oursplitneces-
Table 2: ComparisonoferrorratesonILSVRC-2012validationand
sarilydiffersfromthesplitsused
testsets.

### Best Results Ever Reported

- Thespecificcontributionsofthispaperareasfollows: wetrainedoneofthelargestconvolutional
neuralnetworkstodateonthesubsetsofImageNetusedintheILSVRC-2010andILSVRC-2012
competitions [2] and achieved by far the best results ever reported on these datasets.
- In italics are best results
(seeTable2).

### 3 %, Comparedto26

- Model Top-1 Top-5
We also entered our model in the ILSVRC-2012 com-
petition and report our results in Table 2.
- We also entered a variant of this model in the
ILSVRC-2012competitionandachievedawinningtop-5testerrorrateof15.3%,
comparedto26.2%achievedbythesecond-bestentry.

## Rgb Pixel Values Throughout

### 2012 Test Set Labels

- Since the Sparsecoding[2] 47.1% 28.2%
ILSVRC-2012 test set labels are not publicly available, SIFT+FVs[24] 45.7% 25.7%
we cannot report test error rates for all the models that CNN 37.5% 17.0%
we tried.
- In the remainder of this paragraph, we use
validation and test error rates interchangeably because Table1: ComparisonofresultsonILSVRC-
inourexperiencetheydonotdifferbymorethan0.1% 2010 test set.
- [5],exceptthatourcolumnsarenotindependent(seeFigure2).Thisschemereducesourtop-1
and top-5 error rates by 1.7% and 1.2%, respectively, as compared with a net with half as many
kernelsineachconvolutionallayertrainedononeGPU.Thetwo-GPUnettakesslightlylesstime
totrainthantheone-GPUnet2.
- Onthetestdata,weachievedtop-1andtop-5errorratesof37.5%
and 17.0% which is considerably better than the previous state-of-the-art.
- Our network achieves top-1 and top-5
test set error rates of 37.5% and 17.0%5.

### Five Similar Cnns Gives

- Averaging the predictions
of five similar CNNs gives an error rate of 16.4%.
- The heuristic which we followed was to divide the learning rate by 10 when the validation error
ratestoppedimprovingwiththecurrentlearningrate.
- a top-5 error rate of 18.2%.

### Rgb Pixel Values Throughout

- Specifically, we perform PCA on the set of RGB pixel values throughout the
ImageNettrainingset.
- If we set s = z, we obtain traditional local pooling as commonly employed
in CNNs.
- If we set s < z, we obtain overlapping pooling.

## 14 ], Whichdoesnotmakeuseofimagelabelsandhencehasatendenc…

### Called “ Dropout ”

- 4

Figure2: AnillustrationofthearchitectureofourCNN,explicitlyshowingthedelineationofresponsibilities
betweenthetwoGPUs.OneGPUrunsthelayer-partsatthetopofthefigurewhiletheotherrunsthelayer-parts
atthebottom.TheGPUscommunicateonlyatcertainlayers.Thenetwork’sinputis150,528-dimensional,and
thenumberofneuronsinthenetwork’sremaininglayersisgivenby253,440–186,624–64,896–64,896–43,264–
4096–4096–1000.
- ComputingsimilaritybyusingEuclideandistancebetweentwo4096-dimensional,real-valuedvec-
torsisinefficient,butitcouldbemadeefficientbytraininganauto-encodertocompressthesevectors
toshortbinarycodes.Thisshouldproduceamuchbetterimageretrievalmethodthanapplyingauto-
encoderstotherawpixels[14],whichdoesnotmakeuseofimagelabelsandhencehasatendency
toretrieveimageswithsimilarpatternsofedges,whetherornottheyaresemanticallysimilar.
- The recently-introduced technique, called “dropout” [10], consists
of setting to zero the output of each hidden neuron with probability 0.5.
- Using very deep autoencoders for content-based image retrieval.
- Anotherwaytoprobethenetwork’svisualknowledgeistoconsiderthefeatureactivationsinduced
by an image at the last, 4096-dimensional hidden layer.

### Training One Cnn

- Training one CNN, with an extra sixth con-
volutional layer over the last pooling layer, to classify the entire ImageNet Fall 2011 release
(15M images, 22K categories), and then “fine-tuning” it on ILSVRC-2012 gives an error rate of
16.6%.
- However,kernelsinlayer4takeinput
only from those kernel maps in layer 3 which reside on the same GPU.
- 2Theone-GPUnetactuallyhasthesamenumberofkernelsasthetwo-GPUnetinthefinalconvolutional
layer.

### Url Http :// Www

- Large scale visual recognition challenge 2010. www.image-
net.org/challenges.
- URL
http://www.image-net.org/challenges/LSVRC/2012/.

## Aforementioned Five Cnns Gives

### Aforementioned Five Cnns Gives

- Averaging the predictions of two CNNs that were pre-trained on the entire Fall 2011 re-
lease with the aforementioned five CNNs gives an error rate of 15.3%.
- On this
1CNN 40.7% 18.2% —
datasetwefollowtheconvention
5CNNs 38.1% 16.4% 16.4%
in the literature of using half of
1CNN* 39.0% 16.6% —
the images for training and half
7CNNs* 36.7% 15.4% 15.3%
for testing.
- [11] K.Jarrett,K.Kavukcuoglu,M.A.Ranzato,andY.LeCun.
- [16] Y.LeCun,F.J.Huang,andL.Bottou.
- [15] Y.LeCun,B.Boser,J.S.Denker,D.Henderson,R.E.Howard,W.Hubbard,L.D.Jackel,etal.

### Di W := W

- The update rule for layeronthe224×224×3inputimages.The
weightwwas
top48kernelswerelearnedonGPU1while
(cid:28) ∂L(cid:12) (cid:29) thebottom48kernelswerelearnedonGPU
v i+1 := 0.9·v i −0.0005·(cid:15)·w i −(cid:15)· ∂w (cid:12) wi 2.SeeSection6.1fordetails.
- Di
w := w +v
i+1 i i+1
whereiistheiterationindex,visthemomentumvariable,(cid:15)isthelearningrate,and
(cid:68) ∂L(cid:12)
(cid:12)
(cid:69)
is
∂w wi Di
the average over the ith batch D of the derivative of the objective with respect to w, evaluated at
i
w .

### Thelearningratesforeachnet

- Theresultantarchitectureissomewhatsimilartothatofthe“columnar”CNNemployedbyCires¸an
etal.
- Thelearningratesforeachnet-
etal.

## Already Take Several Days

### Already Take Several Days

- ImageNet Classification with Deep Convolutional
Neural Networks
AlexKrizhevsky IlyaSutskever GeoffreyE.Hinton
UniversityofToronto UniversityofToronto UniversityofToronto
kriz@cs.utoronto.ca ilya@cs.utoronto.ca hinton@cs.utoronto.ca
Abstract
Wetrainedalarge,deepconvolutionalneuralnetworktoclassifythe1.2million
high-resolution images in the ImageNet LSVRC-2010 contest into the 1000 dif-
ferentclasses.
- Thus, compared to standard feedforward neural networks with similarly-sized layers, CNNs have
muchfewerconnectionsandparametersandsotheyareeasiertotrain,whiletheirtheoretically-best
performanceislikelytobeonlyslightlyworse.
- Convolutional neural networks
(CNNs)constituteonesuchclassofmodels[16,11,13,18,15,22,26].
- 4.2 Dropout
Combiningthepredictionsofmanydifferentmodelsisaverysuccessfulwaytoreducetesterrors
[1, 3], but it appears to be too expensive for big neural networks that already take several days
to train.

### Layer Convolutional Neural Models

- This is demonstrated in
Figure 1, which shows the number of iterations re-
quired to reach 25% training error on the CIFAR-10
dataset for a particular four-layer convolutional net-
work.
- The third convolutional layer has 384 kernels of size 3 × 3 ×
256 connected to the (normalized, pooled) outputs of the second convolutional layer.
- This plot shows that we would not have been
abletoexperimentwithsuchlargeneuralnetworksfor
thisworkifwehadusedtraditionalsaturatingneuron Figure 1: A four-layer convolutional neural
models.

### Convolutional Networks

- Convolutional networks and applications in vision.
- InECCV-EuropeanConferenceonComputer
Vision,Florence,Italy,October2012.

## Recognition Task (< 0

### Recognition Task (< 0

- For example, the current-
best error rate on the MNIST digit-recognition task (<0.3%) approaches human performance [4].
- This means that, for example, the
kernelsoflayer3takeinputfromallkernelmapsinlayer2.
- For example, Jarrett
(dashedline).
- For example,
onlyothertypesofcatareconsideredplausiblelabelsfortheleopard.

### Single Convolutional Layer

- For example,
removing any of the middle layers results in a loss of about 2% for the top-1 performance of the
network.
- It is notable
that our network’s performance degrades if a single convolutional layer is removed.
- High-performance neural
networksforvisualobjectclassification.

### Adjusted Manually Throughout Training

- We used an equal learning rate for all layers, which we adjusted manually throughout training.
- Thethird,fourth,andfifthconvolutionallayersareconnectedtooneanotherwithoutanyintervening
pooling or normalization layers.

## Video Sequenceswherethetemporalstructureprovidesveryhelpf…

### Video Sequenceswherethetemporalstructureprovidesveryhelpf…

- Toim-
prove their performance, we can collect larger datasets, learn more powerful models, and use bet-
tertechniquesforpreventingoverfitting.
- But objects in realistic settings exhibit considerable variability, so to learn to recognize them it is
necessary to use much larger training sets.
- Ultimately we would like to use very large and deep convolutional nets on video
sequenceswherethetemporalstructureprovidesveryhelpfulinformationthatismissingorfarless
obviousinstaticimages.
- At test time, we use all the neurons but multiply their outputs by 0.5, which is a
reasonableapproximationtotakingthegeometricmeanofthepredictivedistributionsproducedby
theexponentially-manydropoutnetworks.

### Accelerated Tentlylearnseveraltimesfasterthanequivalents …

- However,onthisdatasetthepri-
effect demonstrated here varies with network
mary concern is preventing overfitting, so the effect
architecture, butnetworkswithReLUsconsis-
they are observing is different from the accelerated
tentlylearnseveraltimesfasterthanequivalents
abilitytofitthetrainingsetwhichwereportwhenus-
withsaturatingneurons.
- Below, we describe some of the novel or unusual
features of our network’s architecture.
- This is what we use throughout our
network,withs = 2andz = 3.

## L .- J

### Su

- [7] J. Deng, A. Berg, S. Satheesh, H. Su, A. Khosla, and L. Fei-Fei.
- [2] A. Berg, J. Deng, and L. Fei-Fei.
- [8] L.Fei-Fei,R.Fergus,andP.Perona.
- Li, K. Li, and L. Fei-Fei.

### L .- J

- [6] J. Deng, W. Dong, R. Socher, L.-J.

## P ][ Α Λ

### 3 %, Respectively

- Thisschemereducesthetop-1andtop-5errorratesby0.4%and
0.3%, respectively, as compared with the non-overlapping scheme s = 2,z = 2, which produces
outputofequivalentdimensions.Wegenerallyobserveduringtrainingthatmodelswithoverlapping
poolingfinditslightlymoredifficulttooverfit.
- Responsenormalizationreducesourtop-1andtop-5errorratesby1.4%and1.2%,
respectively.WealsoverifiedtheeffectivenessofthisschemeontheCIFAR-10dataset:afour-layer
CNNachieveda13%testerrorratewithoutnormalizationand11%withnormalization3.
- Since we also entered our model in
theILSVRC-2012competition, inSection6wereportourresultsonthisversionofthedatasetas
well,forwhichtestsetlabelsareunavailable.OnImageNet,itiscustomarytoreporttwoerrorrates:
top-1andtop-5,wherethetop-5errorrateisthefractionoftestimagesforwhichthecorrectlabel
isnotamongthefivelabelsconsideredmostprobablebythemodel.

### P ][ Α Λ

- ThereforetoeachRGBimagepixelI =
xy
[IR,IG,IB]T weaddthefollowingquantity:
xy xy xy
[p ,p ,p ][α λ ,α λ ,α λ ]T
1 2 3 1 1 2 2 3 3
where p and λ are ith eigenvector and eigenvalue of the 3×3 covariance matrix of RGB pixel
i i
values, respectively, and α is the aforementioned random variable.
